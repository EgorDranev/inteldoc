"""Unit tests for the RU lab-report parser (app/infra/ocr_engine.parse_lab_fields).

Pure: feeds synthetic OcrText so no Tesseract runtime is needed. Covers the four
canonical Эндокор analytes, decimal-comma normalisation, reference parsing, analysis_type
scoping, and the low-confidence threshold.
"""

from __future__ import annotations

from app.infra.ocr_adapter import is_low_confidence
from app.infra.ocr_engine import OcrLine, OcrText, parse_lab_fields


def _text(*lines: tuple[str, float]) -> OcrText:
    ocr_lines = tuple(OcrLine(text=t, confidence=c) for t, c in lines)
    return OcrText(full_text="\n".join(t for t, _ in lines), lines=ocr_lines)


def test_hba1c_with_upper_reference() -> None:
    ocr = _text(("HbA1c 7.2 % < 6.5", 0.61))
    [f] = parse_lab_fields(ocr, "HbA1c")
    assert f.field_key == "HbA1c"
    assert f.raw_value == "7.2"
    assert f.normalized_value == 7.2
    assert f.unit == "%"
    assert f.reference_max == 6.5
    assert f.reference_min is None
    assert f.confidence == 0.61
    assert is_low_confidence(f.confidence) is True


def test_glucose_decimal_comma_and_range_reference() -> None:
    ocr = _text(("Глюкоза натощак 6,8 ммоль/л 3.9–5.6", 0.95))
    [f] = parse_lab_fields(ocr, "glucose")
    assert f.field_key == "Глюкоза"
    assert f.raw_value == "6.8"  # comma normalised to dot
    assert f.normalized_value == 6.8
    assert f.unit == "ммоль/л"
    assert f.reference_min == 3.9
    assert f.reference_max == 5.6
    assert is_low_confidence(f.confidence) is False


def test_cholesterol_panel_returns_total_and_ldl() -> None:
    ocr = _text(
        ("Холестерин общий 5,1 ммоль/л < 5.2", 0.9),
        ("ЛПНП 3,8 ммоль/л < 3.0", 0.88),
    )
    fields = parse_lab_fields(ocr, "cholesterol")
    by_key = {f.field_key: f for f in fields}
    assert set(by_key) == {"Холестерин", "ЛПНП"}
    assert by_key["Холестерин"].normalized_value == 5.1
    assert by_key["Холестерин"].reference_max == 5.2
    assert by_key["ЛПНП"].normalized_value == 3.8
    assert by_key["ЛПНП"].reference_max == 3.0


def test_type_scoping_ignores_other_analytes() -> None:
    # Declared glucose → only the glucose row is returned even if the page has more.
    ocr = _text(
        ("Глюкоза 6,8 ммоль/л", 0.9),
        ("Креатинин 88 мкмоль/л 62–115", 0.9),
    )
    fields = parse_lab_fields(ocr, "glucose")
    assert [f.field_key for f in fields] == ["Глюкоза"]


def test_creatinine_uses_default_reference_when_absent() -> None:
    ocr = _text(("Креатинин 88 мкмоль/л", 0.9))
    [f] = parse_lab_fields(ocr, "creatinine")
    assert f.normalized_value == 88.0
    assert f.unit == "мкмоль/л"
    # No range on the line → spec defaults apply.
    assert f.reference_min == 62.0
    assert f.reference_max == 115.0


def test_no_recognisable_analyte_returns_empty() -> None:
    ocr = _text(("Общий анализ крови — без особенностей", 0.9))
    assert parse_lab_fields(ocr, "glucose") == []


def test_named_analyte_without_value_is_skipped() -> None:
    ocr = _text(("Глюкоза (натощак):", 0.9))
    assert parse_lab_fields(ocr, "glucose") == []
