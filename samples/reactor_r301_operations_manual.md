# Catalytic Hydrocracker Reactor R-301: Operations & Safety Manual

**Document Control Number**: SOP-ENG-2026-R301  
**Revision**: 4.2  
**Effective Date**: 2026-03-15  
**Facility**: Sovereign Petrochemical Complex - Unit 04  

---

## 1. System Overview & P&ID Schematic

Reactor R-301 is a fixed-bed catalytic hydrocracker designed for the conversion of heavy atmospheric and vacuum gas oils into middle distillates and high-octane naphtha blending components. The reactor operates with a three-bed catalyst configuration with intermediate cold hydrogen quench injections.

### Process Flow & Instrumentation Diagram (P&ID)

```text
[Feed Gas Oil] ──> [Charge Pump P-301A/B] ──> [Feed Furnace F-301] ──────────────┐
                                                                                  │
[Make-Up H2] ───> [Recycle Compressor C-301] ────> [Quench Header QH-01] ─┐       │
                                                                         │       ▼
                                                                  ┌──────┴───────────────┐
                                                                  │ Bed 1: Hydrotreating  │ (Catalyst: NiMo/Al2O3)
                                                                  │ Temperature: 385 C   │ [TI-301A/B]
                                                                  ├──────────────────────┤
                                                                  │ Quench Zone 1 [FV-302│ <── Cold H2 Quench
                                                                  ├──────────────────────┤
                                                                  │ Bed 2: First Cracking│ (Catalyst: Zeolite Y)
                                                                  │ Temperature: 405 C   │ [TI-302A/B]
                                                                  ├──────────────────────┤
                                                                  │ Quench Zone 2 [FV-303│ <── Cold H2 Quench
                                                                  ├──────────────────────┤
                                                                  │ Bed 3: Final Cracking│ (Catalyst: Zeolite Y)
                                                                  │ Temperature: 418 C   │ [TI-303A/B]
                                                                  └──────────┬───────────┘
                                                                             │
[Effluent Stream] <── [High-Pressure Separator V-302] <── [Air Cooler E-305] ┘
```

---

## 2. Standard Operating Envelope

Strict compliance with the operating limits defined below is required to prevent runaway exothermic hydrocracking reactions and hydrogen embrittlement.

| Process Variable | Instrument Tag | Normal Range | Alarm High (AH) | Emergency Trip (HH) | Unit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Reactor Inlet Pressure | PT-301 | 135.0 - 142.0 | 145.0 | 148.5 | bar |
| Bed 1 Peak Temperature | TI-301B | 382.0 - 388.0 | 395.0 | 405.0 | °C |
| Bed 2 Peak Temperature | TI-302B | 400.0 - 408.0 | 415.0 | 425.0 | °C |
| Bed 3 Peak Temperature | TI-303B | 412.0 - 420.0 | 428.0 | 438.0 | °C |
| Total Feed Flow Rate | FT-301 | 185.0 - 210.0 | 225.0 | 240.0 | m³/h |
| Recycle Hydrogen Ratio | RATIO-301 | 1200 - 1400 | 1100 (Low) | 950 (LL) | Nm³/m³ |
| Bed 1 Differential Temp | DT-301 | 18.0 - 25.0 | 32.0 | 40.0 | °C |
| Reactor Skin Temperature | TI-SKIN-01 | 370.0 - 390.0 | 410.0 | 430.0 | °C |

---

## 3. Emergency Depressuring System (EDP) & Trip Logic

When reactor peak temperatures exceed Emergency Trip (HH) thresholds or when hydrogen recycle flow drops below Low-Low (LL) limit, the Emergency Depressuring System (EDP) actuates automatically.

### Automated Trip Logic (Two-Out-Of-Three Voting)

The shutdown logic runs on triple-modular redundant (TMR) safety controllers executing the following sequence:

1. **Phase 1 (T=0s)**: Close feed isolation valves `MOV-301` and `MOV-302`. Trip feed charge pumps `P-301A/B`.
2. **Phase 2 (T=2s)**: Fully open hydrogen quench valves `FV-302` and `FV-303` to maximum stroke (100%).
3. **Phase 3 (T=5s)**: If `TI-302B > 425.0 C` or `PT-301 > 148.5 bar`, actuate depressuring valves `XV-301A/B` to flare header at a rate of 21.0 bar/min (API 521 standard rate).

---

## 4. Automation & Validation Code

The following Python script implements the digital twin monitoring logic for automated safety compliance checks. It evaluates live SCADA telemetry against reactor safety thresholds.

```python
"""Reactor R-301 Safety Parameter & Interlock Evaluator.

This script processes continuous telemetry samples and asserts that the operating
state remains within Section 2 safety margins.
"""

from typing import Any


def evaluate_reactor_state(telemetry: dict[str, float]) -> dict[str, Any]:
    """Check reactor temperatures and pressures against interlock limits.

    Args:
        telemetry: Dictionary containing instrument readings:
            - 'inlet_pressure_bar': PT-301 reading
            - 'bed1_temp_c': TI-301B reading
            - 'bed2_temp_c': TI-302B reading
            - 'bed3_temp_c': TI-303B reading
            - 'h2_ratio': RATIO-301 reading

    Returns:
        Dictionary reporting trip verdict, active alarms, and safety margins.
    """
    alarms = []
    trip_required = False
    reasons = []

    # Pressure checks
    pressure = telemetry.get("inlet_pressure_bar", 0.0)
    if pressure >= 148.5:
        trip_required = True
        reasons.append("HIGH-HIGH PRESSURE: PT-301 >= 148.5 bar")
    elif pressure >= 145.0:
        alarms.append("ALARM: High Inlet Pressure PT-301 >= 145.0 bar")

    # Bed temperature checks
    bed2_temp = telemetry.get("bed2_temp_c", 0.0)
    if bed2_temp >= 425.0:
        trip_required = True
        reasons.append("HIGH-HIGH BED 2 TEMP: TI-302B >= 425.0 C")
    elif bed2_temp >= 415.0:
        alarms.append("ALARM: High Bed 2 Temperature TI-302B >= 415.0 C")

    bed3_temp = telemetry.get("bed3_temp_c", 0.0)
    if bed3_temp >= 438.0:
        trip_required = True
        reasons.append("HIGH-HIGH BED 3 TEMP: TI-303B >= 438.0 C")

    # Hydrogen ratio checks
    h2_ratio = telemetry.get("h2_ratio", 1300.0)
    if h2_ratio <= 950.0:
        trip_required = True
        reasons.append("LOW-LOW RECYCLE H2 RATIO: RATIO-301 <= 950 Nm3/m3")

    # Calculate thermal margin to nearest trip
    margin_pressure = max(0.0, 148.5 - pressure)
    margin_bed2 = max(0.0, 425.0 - bed2_temp)

    return {
        "trip_required": trip_required,
        "trip_reasons": reasons,
        "active_alarms": alarms,
        "safety_margins": {
            "pressure_bar_to_trip": round(margin_pressure, 2),
            "bed2_temp_c_to_trip": round(margin_bed2, 2),
        },
        "status": "EMERGENCY_SHUTDOWN" if trip_required else ("WARNING" if alarms else "NOMINAL"),
    }
```

---

## 5. Catalyst Deactivation & Regeneration Criteria

Catalyst beds must undergo oxidative regeneration or replacement when any of the following operational limits are reached:

1. **Normalized Weight Hourly Space Velocity (WHSV)**: Decreases by more than 28% from start-of-run (SOR) baseline.
2. **Bed Differential Pressure**: Total reactor differential pressure `PDT-301` exceeds 4.5 bar due to particulate coke accumulation.
3. **End-of-Run (EOR) Temperature**: Bed 3 required temperature to achieve 85% conversion exceeds 428.0 °C. Operating above this temperature accelerates irreversible thermal sintering of the active metal sites.
