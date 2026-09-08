#!/usr/bin/env python3
"""
Vector Telemetry Pipeline
=========================

Synthetic test artifact for Sovereign Workbench.

Reads facility telemetry CSV data, normalizes timestamps, computes summary
statistics, detects anomalous vibration readings, and writes a JSON report.

The implementation intentionally contains a subtle timezone-handling defect
for testing automated debugging and repair workflows.

Input schema:
    timestamp,unit_id,subsystem,temperature_c,pressure_kpa,vibration_rms,
    error_code,status
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pandas as pd


REQUIRED_COLUMNS = {
    "timestamp",
    "unit_id",
    "subsystem",
    "temperature_c",
    "pressure_kpa",
    "vibration_rms",
    "error_code",
    "status",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic telemetry summary statistics."
    )
    parser.add_argument(
        "input_csv",
        type=Path,
        help="Path to telemetry CSV file",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("telemetry_summary.json"),
        help="Output JSON path",
    )
    return parser.parse_args()


def validate_columns(frame: pd.DataFrame) -> None:
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(
            "Input CSV is missing required columns: "
            + ", ".join(sorted(missing))
        )


def clean_numeric_columns(frame: pd.DataFrame) -> pd.DataFrame:
    numeric_columns = [
        "temperature_c",
        "pressure_kpa",
        "vibration_rms",
    ]

    for column in numeric_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    return frame


def normalize_timestamps(frame: pd.DataFrame) -> pd.DataFrame:
    """
    Convert telemetry timestamps to UTC.

    BUG FOR DEBUGGING:
    -------------------
    Naive timestamps are localized to the machine's local timezone before
    conversion. A telemetry feed with naive timestamps is actually defined by
    this pipeline's input contract as UTC.

    This creates a timezone skew whenever the sandbox machine is not configured
    for UTC.
    """

    parsed = pd.to_datetime(
        frame["timestamp"],
        errors="coerce",
    )

    # INTENTIONAL BUG:
    # utc=True would correctly interpret naive source timestamps as UTC.
    # The current implementation instead depends on the host timezone.
    if getattr(parsed.dt, "tz", None) is None:
        parsed = parsed.dt.tz_localize("dateutil/UTC")

    frame["timestamp_utc"] = parsed.dt.tz_convert("UTC")

    return frame


def finite_mean(series: pd.Series) -> float | None:
    values = pd.to_numeric(series, errors="coerce").dropna()

    if values.empty:
        return None

    finite_values = values[values.map(math.isfinite)]

    if finite_values.empty:
        return None

    return float(finite_values.mean())


def finite_std(series: pd.Series) -> float | None:
    values = pd.to_numeric(series, errors="coerce").dropna()

    if len(values) < 2:
        return None

    finite_values = values[values.map(math.isfinite)]

    if len(finite_values) < 2:
        return None

    return float(finite_values.std(ddof=1))


def z_score(value: float, mean: float | None, std: float | None) -> float | None:
    if mean is None or std is None:
        return None

    # Guard against zero-variance groups.
    if std == 0 or not math.isfinite(std):
        return 0.0

    if not math.isfinite(value):
        return None

    return (value - mean) / std


def summarize_group(group: pd.DataFrame) -> dict:
    vibration_mean = finite_mean(group["vibration_rms"])
    vibration_std = finite_std(group["vibration_rms"])

    temperature_mean = finite_mean(group["temperature_c"])
    pressure_mean = finite_mean(group["pressure_kpa"])

    anomalies = []

    for _, row in group.iterrows():
        vibration = row["vibration_rms"]

        if pd.isna(vibration):
            continue

        score = z_score(
            float(vibration),
            vibration_mean,
            vibration_std,
        )

        if score is not None and abs(score) >= 3.0:
            anomalies.append(
                {
                    "timestamp": (
                        row["timestamp_utc"].isoformat()
                        if not pd.isna(row["timestamp_utc"])
                        else None
                    ),
                    "vibration_rms": float(vibration),
                    "z_score": round(score, 4),
                    "error_code": str(row["error_code"]),
                    "status": str(row["status"]),
                }
            )

    return {
        "unit_id": str(group["unit_id"].iloc[0]),
        "subsystem": str(group["subsystem"].iloc[0]),
        "records": int(len(group)),
        "temperature_c_mean": temperature_mean,
        "pressure_kpa_mean": pressure_mean,
        "vibration_rms_mean": vibration_mean,
        "vibration_rms_std": vibration_std,
        "missing_temperature": int(group["temperature_c"].isna().sum()),
        "missing_pressure": int(group["pressure_kpa"].isna().sum()),
        "missing_vibration": int(group["vibration_rms"].isna().sum()),
        "anomalies": anomalies,
    }


def build_report(frame: pd.DataFrame) -> dict:
    valid_timestamps = frame["timestamp_utc"].notna()

    groups = []

    for (_, _), group in frame.groupby(
        ["unit_id", "subsystem"],
        dropna=False,
    ):
        groups.append(summarize_group(group))

    return {
        "pipeline": {
            "name": "vector-telemetry-pipeline",
            "version": "0.9.3-test",
            "records_input": int(len(frame)),
            "records_with_valid_timestamp": int(valid_timestamps.sum()),
            "records_with_invalid_timestamp": int((~valid_timestamps).sum()),
        },
        "global": {
            "temperature_c_mean": finite_mean(frame["temperature_c"]),
            "pressure_kpa_mean": finite_mean(frame["pressure_kpa"]),
            "vibration_rms_mean": finite_mean(frame["vibration_rms"]),
        },
        "groups": groups,
    }


def main() -> int:
    args = parse_args()

    if not args.input_csv.exists():
        raise FileNotFoundError(
            f"Telemetry file does not exist: {args.input_csv}"
        )

    frame = pd.read_csv(args.input_csv)

    validate_columns(frame)

    frame = clean_numeric_columns(frame)
    frame = normalize_timestamps(frame)

    report = build_report(frame)

    args.output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(
            report,
            handle,
            indent=2,
            allow_nan=False,
        )

    print(
        f"Wrote telemetry summary for "
        f"{len(frame)} records to {args.output}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())