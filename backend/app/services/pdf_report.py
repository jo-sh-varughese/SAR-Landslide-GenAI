"""Generates a citizen advisory alert PDF from a hazard prediction result."""
from __future__ import annotations

import io
from datetime import datetime

from app.schemas.hazard import AdvisoryRequest

_RISK_COLORS = {
    "Safe": "#22c55e",
    "Watch": "#eab308",
    "Warning": "#f97316",
    "Critical": "#ef4444",
    "Severe": "#7f1d1d",
    "Not Applicable": "#475569",
}

_RISK_GUIDANCE = {
    "Safe": "No immediate action required. Continue routine monitoring of local rainfall and slope conditions.",
    "Watch": "Stay alert to weather updates. Avoid unnecessary travel near steep slopes during heavy rainfall.",
    "Warning": "Prepare for possible evacuation. Keep emergency kits ready and monitor official alerts closely.",
    "Critical": "Evacuate low-lying and slope-adjacent areas immediately. Contact local disaster management authorities.",
    "Severe": "Immediate evacuation mandatory. This is a life-threatening hazard level. Follow all authority instructions.",
    "Not Applicable": (
        "This location is predominantly open water. Landslide susceptibility scoring does not apply here; "
        "consult a dedicated coastal/riverine flood model for water-related hazard assessment."
    ),
}


def generate_advisory_pdf(advisory: AdvisoryRequest) -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib.colors import HexColor
        from reportlab.pdfgen import canvas
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("reportlab is required to generate PDF advisories") from exc

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    color = HexColor(_RISK_COLORS.get(advisory.risk_level, "#64748b"))
    guidance = _RISK_GUIDANCE.get(advisory.risk_level, "Monitor official channels for updates.")

    # Header band
    c.setFillColor(HexColor("#0f172a"))
    c.rect(0, height - 30 * mm, width, 30 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#f8fafc"))
    c.setFont("Helvetica-Bold", 18)
    c.drawString(15 * mm, height - 14 * mm, "SAR-Landslide-GenAI — Citizen Advisory Alert")
    c.setFont("Helvetica", 10)
    c.drawString(15 * mm, height - 22 * mm, "Western Ghats (Kerala) Landslide & Flood Hazard Monitoring System")

    y = height - 42 * mm

    c.setFillColor(color)
    c.rect(15 * mm, y - 10 * mm, width - 30 * mm, 12 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#0f172a") if advisory.risk_level in ("Watch",) else HexColor("#ffffff"))
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2, y - 6.5 * mm, f"RISK LEVEL: {advisory.risk_level.upper()}")

    y -= 22 * mm
    c.setFillColor(HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(15 * mm, y, "Affected Zone")
    c.setFont("Helvetica", 11)
    c.drawString(60 * mm, y, advisory.zone.title())

    y -= 8 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(15 * mm, y, "Mean Hazard Index")
    c.setFont("Helvetica", 11)
    c.drawString(60 * mm, y, f"{advisory.mean_hazard_index:.2f} / 1.00")

    y -= 8 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(15 * mm, y, "Estimated Affected Population")
    c.setFont("Helvetica", 11)
    c.drawString(60 * mm, y, f"~{advisory.estimated_affected_population:,} residents")

    y -= 8 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(15 * mm, y, "Issued By")
    c.setFont("Helvetica", 11)
    c.drawString(60 * mm, y, advisory.issued_by)

    y -= 8 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(15 * mm, y, "Issued At")
    c.setFont("Helvetica", 11)
    c.drawString(60 * mm, y, datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))

    y -= 14 * mm
    c.setFont("Helvetica-Bold", 13)
    c.drawString(15 * mm, y, "Recommended Public Guidance")
    y -= 7 * mm
    c.setFont("Helvetica", 10.5)
    text_obj = c.beginText(15 * mm, y)
    text_obj.setLeading(14)
    for line in _wrap_text(guidance, 95):
        text_obj.textLine(line)
    c.drawText(text_obj)

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(HexColor("#64748b"))
    c.drawString(
        15 * mm,
        19 * mm,
        "Risk level from an unvalidated research heuristic (real slope/rainfall data, fixed weights) —",
    )
    c.drawString(
        15 * mm,
        15 * mm,
        "not a trained or field-calibrated model. Requires expert review before any operational use.",
    )
    c.drawString(
        15 * mm,
        11 * mm,
        "This is NOT an official government alert. Always follow instructions from local disaster authorities.",
    )

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()


def _wrap_text(text: str, width: int) -> list[str]:
    words = text.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines
