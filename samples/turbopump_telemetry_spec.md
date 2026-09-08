# Cryogenic Liquid Oxygen Turbopump TP-800: Dynamic Telemetry & Vibration Diagnostics

**Document Identifier**: AERO-SPEC-TP800-REV3  
**Classification**: Propulsion Subsystem Engineering Standard  
**Revision Date**: 2026-06-18  
**Applicability**: Staged Combustion Liquid Rocket Engines (LOX / Kerosene Cycle)  

---

## 1. Turbopump Mechanical Architecture & Instrumentation

Turbopump Unit TP-800 operates at 34,500 RPM delivering liquid oxygen (LOX) at high pressure (285 bar) to the main combustion chamber. The rotating assembly is supported by cryogenic silicon nitride ceramic hybrid ball bearings lubricated solely by subcooled liquid oxygen.

### Sensor Channel Allocation

```text
[LOX Inducer] ─────────────── [LOX Main Impeller] ─────── [Inter-Propellant Seal] ───── [Gas Generator Turbine]
       │                              │                            │                             │
 [ACCEL-RAD-01]                 [ACCEL-RAD-02]               [PRESSURE-DYN-01]             [ACCEL-AXIAL-03]
 (Inducer Vibration)            (Bearing 1 Vibration)        (Seal Cavity Pressure)        (Turbine Housing)
 (0 - 20,000 Hz)                (0 - 20,000 Hz)              (0 - 500 bar)                 (0 - 25,000 Hz)
```

---

## 2. Vibration Spectral Diagnostic Frequency Bands

Turbopump telemetry is digitized at 100 kHz sample rate and decomposed using real-time Fast Fourier Transform (FFT) analysis across five key diagnostic bands:

| Spectral Band Identifier | Target Frequency Range | Physical Phenomenon | Nominal Threshold | Critical Abort Limit | Action Upon Breach |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Band 1: Sub-Synchronous** | 0.35X - 0.48X Shaft Speed (200 - 275 Hz) | Hydrodynamic rotor whirl / cavitation instability | < 1.8 g RMS | 4.2 g RMS | Throttle to 75% power level |
| **Band 2: Synchronous (1X)** | 1.0X Shaft Speed (575 Hz) | Mechanical rotor unbalance / shaft bowing | < 3.5 g RMS | 8.0 g RMS | Engine Abort within 120 ms |
| **Band 3: Blade Pass (BPF)** | 6.0X Shaft Speed (3,450 Hz) | Inducer 6-blade pressure pulse excitation | < 6.0 g RMS | 14.5 g RMS | Command LOX inlet chilldown |
| **Band 4: Impeller Pass (IPF)**| 12.0X Shaft Speed (6,900 Hz) | Main impeller 12-vane volute acoustic resonance | < 5.0 g RMS | 12.0 g RMS | Log acoustic stress cycle |
| **Band 5: High-Frequency** | 12,000 - 22,000 Hz | Bearing race micro-spalling and ball skidding | < 2.2 g RMS | 6.5 g RMS | Abort & Post-fire bearing inspection |

---

## 3. Real-Time Telemetry Processing & Abort Evaluation Script

This Python script evaluates multi-axis accelerometer streams against the critical vibration abort limits. It is designed to run in deterministic, airgapped flight computers.

```python
"""Turbopump TP-800 Real-Time Vibration Telemetry Evaluator.

Processes band-pass filtered RMS accelerometer streams and triggers automated
engine protection actions if dynamic thresholds are exceeded.
"""

from typing import Any


def evaluate_turbopump_vibration(spectral_data: dict[str, float]) -> dict[str, Any]:
    """Assess turbopump vibration telemetry against abort boundaries.

    Args:
        spectral_data: Dictionary containing RMS g-loadings:
            - 'subsync_g_rms': Band 1 reading
            - 'sync_1x_g_rms': Band 2 reading
            - 'blade_pass_g_rms': Band 3 reading
            - 'impeller_pass_g_rms': Band 4 reading
            - 'bearing_hf_g_rms': Band 5 reading
            - 'shaft_speed_rpm': Shaft tachometer reading

    Returns:
        Structured evaluation with abort trigger, active warnings, and power recommendations.
    """
    aborts = []
    warnings = []
    throttle_recommended = False

    shaft_rpm = spectral_data.get("shaft_speed_rpm", 34500.0)
    sync_1x = spectral_data.get("sync_1x_g_rms", 0.0)
    subsync = spectral_data.get("subsync_g_rms", 0.0)
    bpf = spectral_data.get("blade_pass_g_rms", 0.0)
    bearing_hf = spectral_data.get("bearing_hf_g_rms", 0.0)

    # 1X Synchronous Unbalance (Critical Catastrophic Abort)
    if sync_1x >= 8.0:
        aborts.append("CRITICAL: Synchronous 1X Rotor Unbalance >= 8.0 g RMS")
    elif sync_1x >= 5.5:
        warnings.append("WARNING: Elevated 1X Unbalance >= 5.5 g RMS")

    # Sub-synchronous whirl
    if subsync >= 4.2:
        throttle_recommended = True
        warnings.append("WARNING: Severe Hydrodynamic Cavitation Whirl >= 4.2 g RMS")

    # High frequency bearing wear
    if bearing_hf >= 6.5:
        aborts.append("CRITICAL: High Frequency Bearing Race Damage >= 6.5 g RMS")
    elif bearing_hf >= 4.0:
        warnings.append("WARNING: Bearing Micro-Spalling Detected >= 4.0 g RMS")

    # Blade pass frequency
    if bpf >= 14.5:
        aborts.append("CRITICAL: Inducer Blade Resonance >= 14.5 g RMS")

    abort_required = len(aborts) > 0
    state = "ABORT" if abort_required else ("THROTTLE_DOWN" if throttle_recommended else "NOMINAL")

    return {
        "engine_state": state,
        "abort_required": abort_required,
        "abort_reasons": aborts,
        "active_warnings": warnings,
        "throttle_recommended": throttle_recommended,
        "telemetry_summary": {
            "shaft_rpm": round(shaft_rpm, 1),
            "1x_margin_g": round(max(0.0, 8.0 - sync_1x), 2),
            "bearing_hf_margin_g": round(max(0.0, 6.5 - bearing_hf), 2),
        },
    }
```

---

## 4. Visual Inspection Criteria for Cryogenic Bearings

During post-fire borescope and teardown inspections, ceramic hybrid ball bearings are classified using the following visual degradation scales:

1. **Ball Luster & Surface Polish**:
   * *Acceptable*: High specular reflectivity without visible track scarring or discoloration.
   * *Rejectable*: Frosted matte appearance or micro-pitting visible under 20X optical magnification.
2. **Torlon Composite Cage Pocket Clearance**:
   * Nominal diametral ball-to-pocket clearance: $0.180 \pm 0.025$ mm.
   * Maximum allowable pocket elongation: $0.350$ mm.
3. **Seal Labyrinth Rubbing**:
   * Silver-plated seal teeth showing carbon tracking or continuous radial rub exceeding 0.08 mm require dynamic balancing and seal replacement before re-flight.
