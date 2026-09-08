# Cross-Country Hydrocarbon Pipeline PL-04: Ultrasonic Survey & Integrity Assessment

**Document ID**: NDT-SURVEY-2026-PL04  
**Inspection Standard**: ASME B31G / API 579-1 / ASME B31.4  
**Date of Survey**: 2026-08-22  
**Asset**: Crude Oil Transmission Line PL-04 (Sector North)  
**Pipe Specification**: API 5L Grade X65, Outer Diameter: 610.0 mm (24.0 in), Nominal Wall Thickness: 14.3 mm  

---

## 1. Ultrasonic Transducer Scan Array & Geometry

Inline inspection (ILI) was executed using a multi-channel phased-array ultrasonic testing (PAUT) crawler equipped with 64 dual-element pitch-catch transducers spaced at 15-degree circumferential intervals.

### Transducer Radial Orientation Layout

```text
                           12:00 (Top of Pipe)
                               [Sensor 01]
                       [Sensor 16]     [Sensor 02]
                  [Sensor 15]               [Sensor 03]
             [Sensor 14]                         [Sensor 04]
        09:00                                         03:00
      [Sensor 13]                                     [Sensor 05]
             [Sensor 12]                         [Sensor 06]
                  [Sensor 11]               [Sensor 07]
                       [Sensor 10]     [Sensor 08]
                               [Sensor 09]
                          06:00 (Bottom of Pipe)
                          (Water/Sludge Accumulation)
```

---

## 2. Quantitative Ultrasonic Thickness Log

The table below lists measured minimum wall thickness ($t_{meas}$) and maximum pit depths ($d$) recorded across five primary monitoring zones from Kilometer Post KP 12.0 to KP 18.5.

| Segment ID | Kilometer Post (KP) | Clock Position | Nominal Thickness ($t_{nom}$) | Measured Min Thickness ($t_{meas}$) | Flaw Axial Length ($L$) | Max Pit Depth ($d$) | Corrosion Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| PL04-SEC-101 | KP 12.40 | 06:15 | 14.3 mm | 12.8 mm | 45.0 mm | 1.5 mm | General Internal Corrosion |
| PL04-SEC-102 | KP 14.85 | 05:45 | 14.3 mm | 9.8 mm | 120.0 mm | 4.5 mm | Severe Internal Pitting |
| PL04-SEC-103 | KP 16.20 | 12:00 | 14.3 mm | 13.9 mm | 25.0 mm | 0.4 mm | Minor Atmospheric Oxidation |
| PL04-SEC-104 | KP 17.10 | 06:30 | 14.3 mm | 8.4 mm | 210.0 mm | 5.9 mm | Critical Pitting & Gouge |
| PL04-SEC-105 | KP 18.45 | 03:00 | 14.3 mm | 13.2 mm | 60.0 mm | 1.1 mm | External Soil Corrosion |

---

## 3. ASME B31G Modified Criteria for Safe MAOP

The Maximum Allowable Operating Pressure (MAOP) for corroded pipe sections is evaluated using the modified ASME B31G equations.

### Equation Formulation

1. **Folias Bulging Factor ($M$)**:
   * For $(\frac{L^2}{D \cdot t_{nom}}) \le 50.0$:
     $$M = \sqrt{1 + 0.6275 \cdot \left(\frac{L^2}{D \cdot t_{nom}}\right) - 0.003375 \cdot \left(\frac{L^2}{D \cdot t_{nom}}\right)^2}$$
   * For $(\frac{L^2}{D \cdot t_{nom}}) > 50.0$:
     $$M = 0.032 \cdot \left(\frac{L^2}{D \cdot t_{nom}}\right) + 3.3$$

2. **Safe Operating Pressure ($P_{safe}$)**:
   $$P_{safe} = 1.1 \cdot P_{design} \cdot \left[\frac{1 - 0.85 \cdot (d / t_{nom})}{1 - 0.85 \cdot (d / t_{nom}) / M}\right]$$
   *(Provided that $d / t_{nom} \le 0.80$. If $d / t_{nom} > 0.80$, immediate replacement is mandatory).*

---

## 4. Integrity Assessment Python Algorithm

This Python script performs the automated ASME B31G modified calculations and derives remaining safe operating pressure.

```python
"""ASME B31G Modified Pipeline Assessment Engine.

Computes the Folias bulging factor, estimated burst pressure, and safe MAOP
from NDT ultrasonic inspection logs.
"""

import math
from typing import Any


def calculate_asme_b31g(
    outer_diameter_mm: float,
    nominal_wall_mm: float,
    pit_depth_mm: float,
    defect_length_mm: float,
    design_pressure_bar: float,
    smys_mpa: float = 448.0,  # Grade X65 Specified Minimum Yield Strength
) -> dict[str, Any]:
    """Calculate remaining strength and allowable operating pressure.

    Returns:
        Dictionary containing bulging factor M, safe MAOP in bar, and integrity status.
    """
    if nominal_wall_mm <= 0 or outer_diameter_mm <= 0:
        raise ValueError("Dimensions must be positive nonzero floats.")

    depth_ratio = pit_depth_mm / nominal_wall_mm
    if depth_ratio >= 0.80:
        return {
            "status": "IMMEDIATE_REPAIR_MANDATORY",
            "depth_ratio": round(depth_ratio, 3),
            "safe_pressure_bar": 0.0,
            "derate_required": True,
            "action": "Excavate and install Type B pressure-containing composite sleeve.",
        }

    # Calculate parameter z
    z = (defect_length_mm**2) / (outer_diameter_mm * nominal_wall_mm)

    # Compute Folias bulging factor M
    if z <= 50.0:
        m_factor = math.sqrt(1.0 + 0.6275 * z - 0.003375 * (z**2))
    else:
        m_factor = 0.032 * z + 3.3

    # Safe operating pressure factor
    numerator = 1.0 - 0.85 * depth_ratio
    denominator = 1.0 - (0.85 * depth_ratio / m_factor)
    pressure_ratio = numerator / denominator

    safe_pressure = design_pressure_bar * pressure_ratio
    derate_required = safe_pressure < design_pressure_bar

    return {
        "status": "DERATED_SERVICE" if derate_required else "ACCEPTABLE",
        "depth_ratio": round(depth_ratio, 3),
        "folias_factor_m": round(m_factor, 3),
        "original_design_bar": design_pressure_bar,
        "safe_pressure_bar": round(safe_pressure, 2),
        "derate_required": derate_required,
        "derate_percentage": round((1.0 - (safe_pressure / design_pressure_bar)) * 100, 2),
    }
```

---

## 5. Visual Defect Analysis & Maintenance Directives

Sector `PL04-SEC-104` at KP 17.10 exhibited deep internal pitting accompanied by an external mechanical gouge:
1. **Measured Minimum Thickness**: 8.4 mm (down from 14.3 mm nominal, representing a 41.2% wall thickness reduction).
2. **Immediate Action**: Reduce system operating pressure from 85.0 bar to a maximum ceiling of 58.0 bar within 4 hours.
3. **Permanent Repair**: Install a 600 mm full-encirclement welded steel sleeve (API 1104 certified welder) within 14 calendar days.
