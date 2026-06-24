"""OCR adapter — **STUB / RESERVED seam** (spec §5.7, §9.5).

The real engine is next sprint. The *contract* is fixed now: consume an accepted
object and emit **per-field** ``ocr_field`` rows, each with its own ``confidence``
+ ``low_confidence`` — never a document-level flag (INV-AI-2). On unavailability
the document degrades to ``original_only`` (the caller handles that).

Fixtures mirror the prototype seed (incl. the low-confidence glucose reading).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.enums import AnalysisType

LOW_CONFIDENCE_THRESHOLD = 0.75  # Q13: clinical service decides; constant for the pilot


@dataclass(frozen=True, slots=True)
class OcrFieldData:
    field_key: str
    raw_value: str
    normalized_value: float | None
    unit: str | None
    reference_text: str | None
    reference_min: float | None
    reference_max: float | None
    confidence: float


# Per-analysis fixture fields. Glucose carries a deliberately low confidence.
_FIXTURES: dict[str, list[OcrFieldData]] = {
    AnalysisType.HBA1C: [
        OcrFieldData("HbA1c", "7.8", 7.8, "%", "< 6.5", None, 6.5, 0.98),
    ],
    AnalysisType.GLUCOSE: [
        OcrFieldData("Глюкоза", "7.1", 7.1, "ммоль/л", "3.9–5.6", 3.9, 5.6, 0.62),
    ],
    AnalysisType.CREATININE: [
        OcrFieldData("Креатинин", "88", 88.0, "мкмоль/л", "62–115", 62.0, 115.0, 0.95),
    ],
    AnalysisType.CHOLESTEROL: [
        OcrFieldData("Холестерин", "6.1", 6.1, "ммоль/л", "< 5.2", None, 5.2, 0.9),
        OcrFieldData("ЛПНП", "3.8", 3.8, "ммоль/л", "< 3.0", None, 3.0, 0.88),
    ],
}


def extract_fields(analysis_type: str) -> list[OcrFieldData]:
    """Stub extraction. Returns [] for unknown types (→ caller may set original_only)."""
    return list(_FIXTURES.get(analysis_type, []))


def extract_fields_from_object(object_key: str, analysis_type: str) -> list[OcrFieldData]:
    """Engine-aware extraction for an accepted object (spec §5.7, §9.5).

    ``OCR_ENGINE=stub`` (default) ignores the bytes and returns the type-keyed
    fixtures — keeps local/dev/tests free of an OCR runtime. ``OCR_ENGINE=tesseract``
    reads the object's bytes and runs Tesseract + the RU lab parser.

    Synchronous + blocking (S3 read + OCR) — the caller offloads it to a worker
    thread. Any failure (OCR runtime, unreadable image, parse miss) returns [] so
    the document degrades to ``original_only`` instead of failing the upload.
    """
    from app.core.config import get_settings

    engine = get_settings().ocr_engine
    if engine == "stub":
        return extract_fields(analysis_type)

    # Real engines read the file. Imports are local so the stub path (and tests)
    # never load boto3/pytesseract eagerly, and to avoid an import cycle with
    # ocr_engine (which imports OcrFieldData from this module).
    from app.core.logging import get_logger
    from app.infra import ocr_engine, s3_client

    logger = get_logger("ocr")
    try:
        image_bytes = s3_client.get_bytes(object_key)
        ocr_text = ocr_engine.image_to_text(image_bytes)
        fields = ocr_engine.parse_lab_fields(ocr_text, analysis_type)
        # INV-RES-2: never log raw OCR text or analysis values — counts only.
        logger.info("ocr_extracted", engine=engine, field_count=len(fields))
        return fields
    except Exception as exc:  # degrade to original_only, never 500
        logger.warning("ocr_failed", engine=engine, error=type(exc).__name__)
        return []


def is_low_confidence(confidence: float) -> bool:
    return confidence < LOW_CONFIDENCE_THRESHOLD
