from __future__ import annotations

import csv
import io
import os
import re
import unicodedata
from datetime import date, datetime
from typing import Any, Dict

import numpy as np
import pandas as pd


INVALID_MARKERS = {
    "",
    "NULL",
    "NONE",
    "N/A",
    "NA",
    "NAN",
    "#N/A",
    "#VALUE!",
    "#REF!",
    "#DIV/0!",
}


def sanitize_name(value: str, fallback: str = "OBJECT") -> str:
    """
    Convert business names, filenames, sheets, and columns into safe Snowflake
    identifiers: uppercase, ASCII, underscores, no extensions, no special chars.
    """
    base = os.path.splitext(str(value or ""))[0]
    normalized = unicodedata.normalize("NFKD", base)
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_").upper()

    if not normalized:
        normalized = fallback
    if normalized[0].isdigit():
        normalized = f"N_{normalized}"
    return normalized[:255]


def _deduplicate_names(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    unique_names: list[str] = []

    for name in names:
        count = seen.get(name, 0) + 1
        seen[name] = count
        if count == 1:
            unique_names.append(name)
            continue

        suffix = f"_{count}"
        unique_names.append(f"{name[:255 - len(suffix)]}{suffix}")

    return unique_names


def _json_safe_value(value: object) -> object:
    if value is None or value is pd.NA:
        return None
    missing = pd.isna(value)
    if isinstance(missing, (bool, np.bool_)) and bool(missing):
        return None
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _sample_records(dataframe: pd.DataFrame, limit: int = 3) -> list[dict[str, object]]:
    return [
        {str(column): _json_safe_value(value) for column, value in row.items()}
        for row in dataframe.head(limit).to_dict(orient="records")
    ]


def _normalize_value(value: object) -> tuple[object, bool]:
    if not isinstance(value, str):
        return value, False

    trimmed = value.strip()
    if trimmed.upper() in INVALID_MARKERS:
        return None, True
    return trimmed, False


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Safely clean a dataframe and attach a complete data-quality profile."""
    cleaned = df.copy()
    original_rows = int(len(cleaned))
    original_columns = [str(column) for column in cleaned.columns]

    invalid_count = 0
    invalid_examples: list[dict[str, object]] = []
    for column_index, column in enumerate(cleaned.columns):
        normalized_values: list[object] = []
        for row_index, raw_value in cleaned[column].items():
            normalized_value, was_invalid = _normalize_value(raw_value)
            normalized_values.append(normalized_value)
            if was_invalid:
                invalid_count += 1
                if len(invalid_examples) < 10:
                    display_row = int(row_index) + 2 if isinstance(row_index, (int, np.integer)) else str(row_index)
                    invalid_examples.append(
                        {
                            "column": str(column),
                            "row": display_row,
                            "value": str(raw_value),
                        }
                    )
        cleaned.iloc[:, column_index] = normalized_values

    empty_row_mask = cleaned.isna().all(axis=1)
    empty_rows_removed = int(empty_row_mask.sum())
    cleaned = cleaned.loc[~empty_row_mask].copy()

    empty_column_mask = cleaned.isna().all(axis=0)
    empty_columns_removed_names = [
        str(column) for column, is_empty in empty_column_mask.items() if bool(is_empty)
    ]
    cleaned = cleaned.loc[:, ~empty_column_mask].copy()

    sanitized_columns = [
        sanitize_name(str(column), fallback=f"COLUMN_{index + 1}")
        for index, column in enumerate(cleaned.columns)
    ]
    deduplicated_columns = _deduplicate_names(sanitized_columns)
    columns_renamed = [
        {"from": str(original), "to": renamed}
        for original, renamed in zip(cleaned.columns, deduplicated_columns)
        if str(original) != renamed
    ]
    cleaned.columns = deduplicated_columns

    duplicate_mask = cleaned.duplicated(keep="first")
    duplicate_count = int(duplicate_mask.sum())
    duplicate_examples = _sample_records(cleaned.loc[duplicate_mask], limit=3)
    cleaned = cleaned.loc[~duplicate_mask].copy()
    cleaned = cleaned.replace({np.nan: None, pd.NaT: None}).convert_dtypes()

    null_counts = cleaned.isna().sum()
    cleaned_rows = int(len(cleaned))
    null_columns = [
        {
            "column": str(column),
            "null_count": int(count),
            "null_percent": round((int(count) / cleaned_rows) * 100, 1) if cleaned_rows else 0.0,
        }
        for column, count in null_counts.items()
        if int(count) > 0
    ]
    null_heavy_columns = [
        item for item in null_columns if float(item["null_percent"]) >= 50.0
    ]
    null_cells_remaining = int(cleaned.isna().sum().sum())
    rows_with_nulls = int(cleaned.isna().any(axis=1).sum()) if len(cleaned.columns) else 0

    cleaning_actions: list[str] = []
    if invalid_count:
        cleaning_actions.append(f"{invalid_count} valeur(s) invalide(s) ou vide(s) normalisée(s) en NULL")
    if empty_rows_removed:
        cleaning_actions.append(f"{empty_rows_removed} ligne(s) entièrement vide(s) supprimée(s)")
    if empty_columns_removed_names:
        cleaning_actions.append(f"{len(empty_columns_removed_names)} colonne(s) entièrement vide(s) supprimée(s)")
    if duplicate_count:
        cleaning_actions.append(f"{duplicate_count} ligne(s) dupliquée(s) exacte(s) supprimée(s)")
    if columns_renamed:
        cleaning_actions.append(f"{len(columns_renamed)} nom(s) de colonne adapté(s) à Snowflake")
    if not cleaning_actions:
        cleaning_actions.append("Aucun nettoyage automatique requis")

    quality_profile: dict[str, Any] = {
        "original_rows": original_rows,
        "cleaned_rows": cleaned_rows,
        "rows_removed": original_rows - cleaned_rows,
        "empty_rows_removed": empty_rows_removed,
        "duplicate_rows_removed": duplicate_count,
        "malformed_rows_removed": 0,
        "malformed_row_examples": [],
        "original_columns": len(original_columns),
        "cleaned_columns": int(len(cleaned.columns)),
        "empty_columns_removed": len(empty_columns_removed_names),
        "empty_column_names": empty_columns_removed_names,
        "columns_renamed": columns_renamed,
        "invalid_values_replaced": invalid_count,
        "null_cells_remaining": null_cells_remaining,
        "rows_with_nulls": rows_with_nulls,
        "null_columns": null_columns,
        "null_heavy_columns": null_heavy_columns,
        "duplicate_examples": duplicate_examples,
        "sample_rows": _sample_records(cleaned, limit=3),
        "cleaning_actions": cleaning_actions,
    }

    cleaned.attrs["quality_profile"] = quality_profile
    cleaned.attrs["duplicate_count"] = duplicate_count
    cleaned.attrs["duplicate_examples"] = duplicate_examples
    cleaned.attrs["invalid_count"] = invalid_count
    cleaned.attrs["invalid_examples"] = invalid_examples
    return cleaned


def read_tabular_file(file_bytes: bytes, original_filename: str) -> Dict[str, pd.DataFrame]:
    """Read and clean an Excel workbook or CSV file."""
    extension = os.path.splitext(original_filename or "")[1].lower()
    if extension == ".csv":
        last_error: Exception | None = None
        for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
            try:
                decoded = file_bytes.decode(encoding)
                malformed_rows: list[list[str]] = []
                malformed_count = 0

                def capture_malformed_row(row: list[str]) -> None:
                    nonlocal malformed_count
                    malformed_count += 1
                    if len(malformed_rows) < 5:
                        malformed_rows.append(row[:10])
                    return None

                try:
                    delimiter = csv.Sniffer().sniff(decoded[:8192], delimiters=",;\t|").delimiter
                except csv.Error:
                    delimiter = ","
                dataframe = pd.read_csv(
                    io.StringIO(decoded),
                    sep=delimiter,
                    engine="python",
                    on_bad_lines=capture_malformed_row,
                )
                source_name = os.path.splitext(os.path.basename(original_filename))[0] or "DATA"
                cleaned = clean_dataframe(dataframe)
                if malformed_count:
                    profile = cleaned.attrs["quality_profile"]
                    profile["malformed_rows_removed"] = malformed_count
                    profile["malformed_row_examples"] = malformed_rows
                    profile["original_rows"] += malformed_count
                    profile["rows_removed"] += malformed_count
                    profile["cleaning_actions"].insert(
                        0,
                        f"{malformed_count} ligne(s) CSV mal formée(s) ignorée(s)",
                    )
                return {source_name: cleaned}
            except (UnicodeDecodeError, pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
                last_error = exc
        raise ValueError(f"Invalid CSV file: {last_error}") from last_error

    if extension not in {".xlsx", ".xls"}:
        raise ValueError("Only .xlsx, .xls, and .csv files are accepted.")

    try:
        workbook = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None)
    except Exception as exc:
        raise ValueError(f"Invalid Excel file: {exc}") from exc

    if not workbook:
        raise ValueError("The Excel file does not contain any sheets.")

    return {
        sheet_name: clean_dataframe(dataframe)
        for sheet_name, dataframe in workbook.items()
    }


def read_excel_file(file_bytes: bytes) -> Dict[str, pd.DataFrame]:
    """Backward-compatible Excel-only reader."""
    return read_tabular_file(file_bytes, "upload.xlsx")
