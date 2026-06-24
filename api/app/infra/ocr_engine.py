"""Real OCR engine: image bytes → recognised text → structured lab fields.

Two layers, deliberately split so they can be swapped/tested independently:

1. **OCR-to-text** (``image_to_text``) — Tesseract today. The only Tesseract-bound
   code; ``pytesseract``/``PIL`` are imported lazily so importing this module (and
   running the parser tests) needs no OCR runtime. A future ``yandex_vision`` engine
   produces the same :class:`OcrText` and the parser below is unchanged.
2. **Lab parser** (``parse_lab_fields``) — pure, stdlib-only. Maps recognised RU lab
   text to the fixed :class:`~app.infra.ocr_adapter.OcrFieldData` contract (analyte →
   value + unit + reference + per-field confidence). This is the reusable meat.

Confidence is OCR-line confidence (mean word confidence on the matched line),
normalised to 0..1. A vision model's self-reported confidence would map in here too.
``ocr_adapter.is_low_confidence`` applies the pilot threshold (INV-AI-2).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.core.config import get_settings
from app.infra.ocr_adapter import OcrFieldData


@dataclass(frozen=True, slots=True)
class OcrLine:
    text: str
    confidence: float  # 0..1, mean of the line's word confidences


@dataclass(frozen=True, slots=True)
class OcrText:
    full_text: str
    lines: tuple[OcrLine, ...] = field(default_factory=tuple)


# ─── Layer 1: OCR-to-text (Tesseract) ────────────────────────────────────────

# PDFs (the usual lab-report artefact) are rasterised page-by-page; cap pages so a
# huge scan can't stall the upload. Photos/images take the single-image path.
_PDF_MAX_PAGES = 5


def _load_images(data: bytes) -> list[Any]:
    """Decode uploaded bytes into one or more page images. PDF → rasterised pages
    (needs poppler + pdf2image); otherwise a single Pillow image."""
    import io

    if data[:5] == b"%PDF-":
        from pdf2image import convert_from_bytes

        return list(
            convert_from_bytes(data, dpi=300, first_page=1, last_page=_PDF_MAX_PAGES)
        )
    from PIL import Image

    return [Image.open(io.BytesIO(data))]


def _data_to_lines(data: dict[str, Any]) -> list[OcrLine]:
    """Group pytesseract ``image_to_data`` words into confidence-bearing lines."""
    grouped: dict[tuple[int, int, int], list[tuple[str, float]]] = {}
    order: list[tuple[int, int, int]] = []
    for i in range(len(data["text"])):
        word = (data["text"][i] or "").strip()
        if not word:
            continue
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = -1.0
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        if key not in grouped:
            grouped[key] = []
            order.append(key)
        grouped[key].append((word, conf))

    lines: list[OcrLine] = []
    for key in order:
        words = grouped[key]
        confs = [c for _, c in words if c >= 0]
        conf01 = (sum(confs) / len(confs) / 100.0) if confs else 0.0
        lines.append(
            OcrLine(text=" ".join(w for w, _ in words), confidence=round(conf01, 4))
        )
    return lines


def image_to_text(image_bytes: bytes) -> OcrText:
    """Recognise an uploaded image or PDF into confidence-bearing lines.

    Lazy imports keep ``pytesseract`` / ``Pillow`` / ``pdf2image`` off the import
    path for everything that only needs the parser (tests, the stub engine).
    """
    import pytesseract

    lang = get_settings().ocr_tesseract_lang
    lines: list[OcrLine] = []
    for image in _load_images(image_bytes):
        data = pytesseract.image_to_data(
            image, lang=lang, output_type=pytesseract.Output.DICT
        )
        lines.extend(_data_to_lines(data))

    full_text = "\n".join(line.text for line in lines)
    return OcrText(full_text=full_text, lines=tuple(lines))


# ─── Layer 2: RU lab parser (pure) ───────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class _Analyte:
    field_key: str  # canonical RU label shown to the patient/doctor
    analysis_type: str  # AnalysisType value this analyte belongs to
    name_pattern: str  # case-insensitive regex to locate the analyte on a line
    default_unit: str
    default_reference_text: str
    default_reference_min: float | None
    default_reference_max: float | None


# Order matters only for "scan all" fallback; within a type the first match wins.
_ANALYTES: tuple[_Analyte, ...] = (
    _Analyte(
        "HbA1c", "HbA1c",
        r"hba1c|a1c|гликир\w*\s+гемоглобин|гликозилир\w*\s+гемоглобин",
        "%", "< 6.5", None, 6.5,
    ),
    _Analyte(
        "Глюкоза", "glucose",
        r"глюкоз\w*|glucose|сахар\s+кров\w*",
        "ммоль/л", "3.9–5.6", 3.9, 5.6,
    ),
    _Analyte(
        "Креатинин", "creatinine",
        r"креатинин\w*|creatinine",
        "мкмоль/л", "62–115", 62.0, 115.0,
    ),
    _Analyte(
        "Холестерин", "cholesterol",
        r"холестерин\s+общ\w*|общ\w*\s+холестерин|холестерин(?!\s*лпнп)|cholesterol",
        "ммоль/л", "< 5.2", None, 5.2,
    ),
    _Analyte(
        "ЛПНП", "cholesterol",
        r"лпнп|ldl|липопротеид\w*\s+низк\w*",
        "ммоль/л", "< 3.0", None, 3.0,
    ),
)

# Known unit tokens, longest-first so «ммоль/л» wins over «моль».
_UNIT_TOKENS: tuple[str, ...] = (
    "ммоль/л", "мкмоль/л", "мкмоль", "ммоль", "мг/дл", "г/л", "ед/л", "%",
)

_NUMBER = r"[-+]?\d+(?:[.,]\d+)?"
_NUMBER_RE = re.compile(_NUMBER)
# Reference range forms: «< 6.5», «> 3.0», «3.9–5.6» / «62-115» (hyphen, en/em dash).
_REF_UPPER_RE = re.compile(r"<\s*(" + _NUMBER + r")")
_REF_LOWER_RE = re.compile(r">\s*(" + _NUMBER + r")")
_REF_RANGE_RE = re.compile(r"(" + _NUMBER + r")\s*[-–—]\s*(" + _NUMBER + r")")


def _to_float(raw: str) -> float | None:
    try:
        return float(raw.replace(",", "."))
    except ValueError:
        return None


def _specs_for_type(analysis_type: str) -> tuple[_Analyte, ...]:
    matched = tuple(a for a in _ANALYTES if a.analysis_type == analysis_type)
    # Unknown / "other" → scan everything and return whatever the document yields.
    return matched or _ANALYTES


def _extract_unit(text: str) -> str | None:
    low = text.lower()
    for token in _UNIT_TOKENS:
        if token.lower() in low:
            return token
    return None


def _extract_reference(text: str) -> tuple[str | None, float | None, float | None]:
    """Return (reference_text, ref_min, ref_max) from the post-value remainder."""
    m = _REF_RANGE_RE.search(text)
    if m:
        lo, hi = _to_float(m.group(1)), _to_float(m.group(2))
        return f"{m.group(1)}–{m.group(2)}", lo, hi
    m = _REF_UPPER_RE.search(text)
    if m:
        return f"< {m.group(1)}", None, _to_float(m.group(1))
    m = _REF_LOWER_RE.search(text)
    if m:
        return f"> {m.group(1)}", _to_float(m.group(1)), None
    return None, None, None


def _parse_one(line: OcrLine, spec: _Analyte) -> OcrFieldData | None:
    name_re = re.compile(spec.name_pattern, re.IGNORECASE)
    nm = name_re.search(line.text)
    if nm is None:
        return None
    rest = line.text[nm.end():]
    vm = _NUMBER_RE.search(rest)
    if vm is None:
        return None  # analyte named but no value on the line → skip
    raw_value = vm.group(0)
    normalized = _to_float(raw_value)
    after_value = rest[vm.end():]
    unit = _extract_unit(rest) or spec.default_unit
    ref_text, ref_min, ref_max = _extract_reference(after_value)
    if ref_text is None:
        ref_text, ref_min, ref_max = (
            spec.default_reference_text,
            spec.default_reference_min,
            spec.default_reference_max,
        )
    return OcrFieldData(
        field_key=spec.field_key,
        raw_value=raw_value.replace(",", "."),
        normalized_value=normalized,
        unit=unit,
        reference_text=ref_text,
        reference_min=ref_min,
        reference_max=ref_max,
        confidence=line.confidence,
    )


def parse_lab_fields(ocr: OcrText, analysis_type: str) -> list[OcrFieldData]:
    """Map recognised lab text to per-field rows for the declared analysis type.

    First line-match per analyte wins (lab reports list each analyte once). Returns
    [] when nothing recognisable is found — the caller degrades to ``original_only``.
    """
    specs = _specs_for_type(analysis_type)
    found: list[OcrFieldData] = []
    seen: set[str] = set()
    for spec in specs:
        if spec.field_key in seen:
            continue
        for line in ocr.lines:
            parsed = _parse_one(line, spec)
            if parsed is not None:
                found.append(parsed)
                seen.add(spec.field_key)
                break
    return found
