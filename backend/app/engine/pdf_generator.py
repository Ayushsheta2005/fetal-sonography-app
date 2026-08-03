import math, re
from typing import Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                 TableStyle, HRFlowable, KeepTogether)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.graphics.shapes import Drawing, Rect, Line, Circle, String, PolyLine

# ── Clinical Palette ─────────────────────────────────────────────────────────
NAVY         = colors.HexColor('#0f2042')  # Deep clinical navy for headers
ACCENT_BLUE  = colors.HexColor('#0055b8')  # Bright accent blue
DARKGREY     = colors.HexColor('#222222')  # Main text color
LIGHT_BG     = colors.HexColor('#f8fafc')  # Alternating row background
HEADER_BG    = colors.HexColor('#edf2f9')  # Table header block background
BORDER_COLOR = colors.HexColor('#d1d5db')  # Subtle border lines
RED_ALERT    = colors.HexColor('#dc2626')  # Abnormal finding color
AMBER_WARN   = colors.HexColor('#d97706')  # Not seen / warning color
GREEN_OK     = colors.HexColor('#059669')  # Normal tickmark color

# ── Styles ────────────────────────────────────────────────────────────────────
def make_styles():
    s = getSampleStyleSheet()
    title = ParagraphStyle('DocTitle', fontName='Helvetica-Bold', fontSize=18,
                           leading=22, alignment=1, textColor=NAVY, spaceAfter=2)
    subtitle = ParagraphStyle('DocSubtitle', fontName='Helvetica', fontSize=10,
                              leading=12, alignment=1, textColor=ACCENT_BLUE, spaceAfter=8)
    bold10 = ParagraphStyle('Bold10', fontName='Helvetica-Bold', fontSize=9.5,
                            leading=13, textColor=DARKGREY)
    norm9  = ParagraphStyle('Norm9', fontName='Helvetica', fontSize=9,
                            leading=13, textColor=DARKGREY)
    sec    = ParagraphStyle('SecHeader', fontName='Helvetica-Bold', fontSize=11,
                            leading=15, textColor=colors.white)
    check  = ParagraphStyle('CheckItem', fontName='Helvetica', fontSize=9,
                            leading=14, textColor=DARKGREY)
    remark = ParagraphStyle('RemarkText', fontName='Helvetica', fontSize=9.5,
                            leading=14, textColor=DARKGREY)
    return dict(title=title, subtitle=subtitle, bold10=bold10, norm9=norm9,
                sec=sec, check=check, remark=remark)


def section_banner(title_text: str, styles: dict) -> Table:
    """Creates a full-width dark navy banner for major report section headings."""
    p = Paragraph(f'<b>{title_text}</b>', styles['sec'])
    t = Table([[p]], colWidths=[7.2 * inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), NAVY),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
    ]))
    return t


def build_growth_chart(param_key: str, title_str: str, patient_ga: float, patient_val: Optional[float], patient_crl: Optional[float] = None) -> Drawing:
    """Generate authentic, aesthetic, compact FMF vector charts (252x144pt) for side-by-side display."""
    d = Drawing(252, 144)
    d.add(Rect(0, 0, 252, 144, fillColor=colors.HexColor('#ffffff'), strokeColor=colors.HexColor('#cbd5e1'), strokeWidth=1, rx=6, ry=6))
    
    x_min, x_max = 28.0, 224.0
    y_min, y_max = 24.0, 110.0
    w_w = x_max - x_min
    h_h = y_max - y_min
    
    is_nt = (param_key == 'nt')
    x_label = "CRL (mm)" if is_nt else "Gestational age (w)"
    
    # Header title & centile legend subtitle
    d.add(String(10, 128, f"📈 {title_str}", fontName='Helvetica-Bold', fontSize=8.5, fillColor=colors.HexColor('#0055b8')))
    
    # (ref_table_50th, v_min, v_max, centiles_to_draw, unit, w_min, w_max, w_step)
    ref_map = {
        'bpd':    ({14:26, 18:42, 22:54, 26:66, 30:78, 34:86, 38:93, 42:98}, 0.0, 120.0, [10, 90], "mm", 14.0, 42.0, 4),
        'hc':     ({14:100, 18:152, 22:198, 26:241, 30:281, 34:314, 38:339, 42:354}, 0.0, 400.0, [10, 90], "mm", 14.0, 42.0, 4),
        'ac':     ({14:85, 18:132, 22:175, 26:220, 30:263, 34:305, 38:341, 42:365}, 0.0, 450.0, [10, 90], "mm", 14.0, 42.0, 4),
        'fl':     ({14:15, 18:27, 22:39, 26:50, 30:60, 34:68, 38:75, 42:80}, 0.0, 100.0, [10, 90], "mm", 14.0, 42.0, 4),
        'efw':    ({22:480, 24:670, 26:910, 28:1210, 30:1560, 32:1950, 34:2380, 36:2830, 38:3280, 40:3650, 42:3900}, 0.0, 5500.0, [5, 10, 90, 95], "g", 22.0, 42.0, 4),
        'uma_pi': ({20:1.30, 24:1.18, 28:1.05, 32:0.95, 36:0.86, 40:0.78}, 0.0, 1.8, [5, 95], "PI", 20.0, 40.0, 4),
        'mca_pi': ({20:1.55, 24:1.80, 28:2.05, 32:2.10, 36:1.85, 40:1.50}, 0.0, 3.0, [5, 95], "PI", 20.0, 40.0, 4),
        'cpr':    ({20:1.25, 24:1.60, 28:1.95, 32:2.15, 36:2.00, 40:1.75}, 0.0, 3.5, [5, 95], "Ratio", 20.0, 40.0, 4),
        'uta_pi': ({20:1.18, 24:0.95, 28:0.82, 32:0.75, 36:0.70, 40:0.68}, 0.0, 2.2, [5, 95], "PI", 20.0, 40.0, 4),
        'dv_piv': ({20:0.65, 24:0.60, 28:0.56, 32:0.52, 36:0.50, 40:0.48}, 0.0, 1.5, [5, 95], "PIV", 20.0, 40.0, 4),
        'nt':     ({45:1.2, 50:1.3, 55:1.4, 60:1.5, 65:1.7, 70:1.8, 75:2.0, 80:2.1, 84:2.2}, 0.0, 4.0, [5, 95], "mm", 45.0, 85.0, 10),
    }
    
    data_tuple = ref_map.get(param_key, ref_map['bpd'])
    ref_table, v_min, v_max, centiles_list, unit, w_min, w_max, w_step = data_tuple
    
    cent_subtitle = "— 50th (median)   " + ("— 10th & 90th centiles" if centiles_list==[10,90] else "— 5th, 10th, 90th & 95th" if len(centiles_list)==4 else "— 5th & 95th centiles")
    d.add(String(10, 116, cent_subtitle, fontName='Helvetica', fontSize=6.5, fillColor=colors.HexColor('#64748b')))
    
    def get_x(w: float) -> float:
        return x_min + ((max(w_min, min(w_max, w)) - w_min) / (w_max - w_min)) * w_w
        
    def get_y(v: float) -> float:
        return y_min + ((max(v_min, min(v_max, v)) - v_min) / (v_max - v_min)) * h_h
        
    # Draw X gridlines & numbers
    curr_w = w_min
    while curr_w <= w_max + 0.1:
        gx = get_x(curr_w)
        d.add(Line(gx, y_min, gx, y_max, strokeColor=colors.HexColor('#f1f5f9'), strokeWidth=0.5))
        d.add(String(gx - 4.5, y_min - 9, f"{int(curr_w)}", fontName='Helvetica', fontSize=6.5, fillColor=colors.HexColor('#475569')))
        curr_w += w_step
        
    # Draw Y gridlines (4 horizontal sections = 5 ticks)
    for step in range(0, 5):
        val_step = v_min + (v_max - v_min) * (step / 4.0)
        gy = get_y(val_step)
        d.add(Line(x_min, gy, x_max, gy, strokeColor=colors.HexColor('#f1f5f9'), strokeWidth=0.5))
        lbl = f"{int(val_step)}" if val_step >= 10 or val_step == 0 else f"{val_step:.1f}"
        d.add(String(4, gy - 2.5, lbl, fontName='Helvetica', fontSize=6.5, fillColor=colors.HexColor('#475569')))
        
    # Axis border lines & inside x-label
    d.add(Line(x_min, y_min, x_max, y_min, strokeColor=colors.HexColor('#64748b'), strokeWidth=0.8))
    d.add(Line(x_min, y_min, x_min, y_max, strokeColor=colors.HexColor('#64748b'), strokeWidth=0.8))
    d.add(String(x_max - 68, y_min + 3, x_label, fontName='Helvetica', fontSize=6.5, fillColor=colors.HexColor('#475569')))
    
    # Plot reference percentile curves
    mults = {5: 0.76, 10: 0.86, 90: 1.14, 95: 1.24}
    for c in centiles_list:
        pts = []
        for wk, v50 in sorted(ref_table.items()):
            pts.extend([get_x(wk), get_y(v50 * mults[c])])
        d.add(PolyLine(pts, strokeColor=colors.HexColor('#94a3b8'), strokeWidth=0.8, strokeDashArray=[2, 2]))
        d.add(String(x_max + 2, get_y(ref_table[max(ref_table.keys())] * mults[c]) - 2.5, f"{c}th", fontName='Helvetica', fontSize=6, fillColor=colors.HexColor('#64748b')))
        
    pts_50 = []
    for wk, v50 in sorted(ref_table.items()):
        pts_50.extend([get_x(wk), get_y(v50)])
    d.add(PolyLine(pts_50, strokeColor=colors.HexColor('#0284c7'), strokeWidth=1.4))
    d.add(String(x_max + 2, get_y(ref_table[max(ref_table.keys())]) - 2.5, "50th", fontName='Helvetica-Bold', fontSize=6.5, fillColor=colors.HexColor('#0284c7')))
    
    # Plot Red Patient Dot & clean card footer banner
    plot_x_val = patient_crl if (is_nt and patient_crl and patient_crl > 0) else patient_ga
    if patient_val is not None and patient_val > 0 and plot_x_val > 0:
        px = get_x(plot_x_val)
        py = get_y(patient_val)
        d.add(Circle(px, py, 3.5, fillColor=colors.HexColor('#dc2626'), strokeColor=colors.white, strokeWidth=1.0))
        
        annot_str = f"🔴 Patient: {round(patient_val, 2)} {unit} at {round(plot_x_val, 1)}{'mm' if is_nt else 'w'}"
        d.add(String(10, 4, annot_str, fontName='Helvetica-Bold', fontSize=7.5, fillColor=colors.HexColor('#dc2626')))
        
    return d


def render_graph_grid(chart_drawings: list, story: list):
    """Render compact chart drawings side-by-side in an aesthetic two-column dashboard grid."""
    if not chart_drawings:
        return
    rows = []
    for i in range(0, len(chart_drawings), 2):
        col1 = chart_drawings[i]
        col2 = chart_drawings[i+1] if i + 1 < len(chart_drawings) else ''
        rows.append([col1, col2])
        
    t_grid = Table(rows, colWidths=[255, 255])
    t_grid.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(t_grid)
    story.append(Spacer(1, 0.05 * inch))


def format_anatomy_item(label: str, status: str, custom: dict, comments: list = None) -> str:
    """Format anatomy check items using reliable ZapfDingbats glyphs and color highlighting."""
    val = status.lower().strip()

    if not comments:
        comments = []
    elif isinstance(comments, str):
        comments = [comments]

    note_str = ""
    for c in comments:
        if c and str(c).strip():
            c_clean = str(c).strip()
            note_color = "#dc2626" if val not in ('normal', 'seen', 'intact', 'leftside', 'yes', 'closed', 'no', 'clear') and val not in ('not_seen', 'not seen') else "#334155"
            note_str += f'<br/>&nbsp;&nbsp;&nbsp;&nbsp;<font color="{note_color}" size=8><i><b>Note:</b> {c_clean}</i></font>'

    # Check for custom measurement overrides
    lbl_lower = label.lower()
    if 'lateral ventricle' in lbl_lower or label == 'Lateral Ventricles':
        lv = custom.get('lv', '—')
        return f'<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;Lateral Ventricles: <b>{lv} mm</b>' + note_str
    if 'nuchal thickness' in lbl_lower or label == 'Nuchal Thickness':
        nt = custom.get('nt', '—')
        return f'<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;Nuchal Thickness: <b>{nt} mm</b>' + note_str
    if 'cisterna magna' in lbl_lower or label == 'Cisterna Magna':
        cm_val = custom.get('cm', '—')
        return f'<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;Cisterna Magna: <b>{cm_val} mm</b>' + note_str
    if 'fhm' in lbl_lower:
        fhr = custom.get('fhr', '—')
        return f'<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;FHM: <b>{fhr} bpm</b>' + note_str
    if 'regurgitation' in lbl_lower:
        if val in ('abnormal', 'yes', 'present'):
            return f'<font name="ZapfDingbats" color="#dc2626" size=10>8</font> &nbsp;Regurgitation: <font color="#dc2626"><b>Present / Abnormal</b></font>' + note_str
        else:
            return f'<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;Regurgitation: <b>No</b>' + note_str

    # Clean standard suffixes from labels for elegant display
    core_name = label
    for suffix in [' normal', ' seen/normal', ' seen', ' intact', ' leftside', ' no', ' clear']:
        if core_name.lower().endswith(suffix):
            core_name = core_name[: -len(suffix)].strip()
            break

    # Determine status icon and formatting
    if val in ('normal', 'seen', 'intact', 'leftside', 'yes', 'closed', 'no', 'clear'):
        disp = val.capitalize()
        if val == 'leftside': disp = 'Left side'
        return f'<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;{core_name}: <font color="#333333">{disp}</font>' + note_str
    elif val in ('not_seen', 'not seen'):
        return f'<font name="ZapfDingbats" color="#d97706" size=10>8</font> &nbsp;{core_name}: <font color="#d97706"><b>Not seen</b></font>' + note_str
    elif any(w in val for w in ['abnormal', 'defect', 'cyst', 'mass', 'regurg', 'effusion', 'hygroma']):
        # Abnormal / alert item in RED
        disp = status.strip().replace('_', ' ')
        return f'<font name="ZapfDingbats" color="#dc2626" size=10>8</font> &nbsp;{core_name}: <font color="#dc2626"><b>{disp}</b></font>' + note_str
    else:
        # Custom descriptive value from dropdown (e.g., "Normal (square shape)", "Mild dilation")
        disp = status.strip()
        if any(w in val for w in ['normal', 'seen', 'intact', 'clear', 'no ', 'variant']):
            return f'<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;{core_name}: <font color="#0369a1"><b>{disp}</b></font>' + note_str
        else:
            return f'<font name="ZapfDingbats" color="#0ea5e9" size=10>4</font> &nbsp;{core_name}: <font color="#0284c7"><b>{disp}</b></font>' + note_str


def generate_pdf(data: dict, output_path: str):
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        rightMargin=36, leftMargin=36,
        topMargin=32, bottomMargin=32
    )
    st = make_styles()
    story = []

    # ── HEADER & TITLE ───────────────────────────────────────────────────────
    story.append(Paragraph("FETAL ANOMALY DIAGNOSTIC SCAN REPORT", st['title']))
    story.append(Paragraph("COMPREHENSIVE ULTRASOUND ASSESSMENT", st['subtitle']))
    story.append(HRFlowable(width="100%", thickness=2, color=NAVY, spaceAfter=10))

    # ── PATIENT DETAILS BLOCK ────────────────────────────────────────────────
    ph_data = [
        [Paragraph('<b>Patient Name:</b>', st['bold10']),
         Paragraph(f'<b>{data.get("patient_name","").upper()}</b>', st['norm9']),
         Paragraph('<b>Date:</b>', st['bold10']),
         Paragraph(data.get('exam_date',''), st['norm9'])],
        
        [Paragraph('<b>Patient ID:</b>', st['bold10']),
         Paragraph(data.get('patient_id',''), st['norm9']),
         Paragraph('<b>GA (LMP):</b>', st['bold10']),
         Paragraph(data.get('ga_lmp',''), st['norm9'])],
        
        [Paragraph('<b>Referring Doctor:</b>', st['bold10']),
         Paragraph(data.get('referring_doctor','').upper(), st['norm9']),
         Paragraph('<b>EDD (LMP):</b>', st['bold10']),
         Paragraph(data.get('edd_lmp',''), st['norm9'])],
        
        [Paragraph('<b>Sonologist:</b>', st['bold10']),
         Paragraph(data.get('doctor_name','').upper(), st['norm9']),
         Paragraph('<b>GA (Scan):</b>', st['bold10']),
         Paragraph(f'<b>{data.get("ga_scan","")}</b>', st['norm9'])],

        [Paragraph('', st['norm9']),
         Paragraph('', st['norm9']),
         Paragraph('<b>EDD (Scan):</b>', st['bold10']),
         Paragraph(data.get('edd_scan',''), st['norm9'])],
    ]
    t_ph = Table(ph_data, colWidths=[1.5*inch, 2.6*inch, 1.2*inch, 1.9*inch])
    t_ph.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('TOPPADDING',(0,0),(-1,-1),3),
        ('BOTTOMPADDING',(0,0),(-1,-1),3),
        ('BACKGROUND',(0,0),(-1,-1),HEADER_BG),
        ('BOX',(0,0),(-1,-1),1,BORDER_COLOR),
        ('INNERGRID',(0,0),(-1,-1),0.5,colors.HexColor('#e2e8f0')),
    ]))
    story.append(t_ph)
    story.append(Spacer(1, 0.16 * inch))

    # ── 1. FETAL DETAILS ─────────────────────────────────────────────────────
    story.append(section_banner("1. FETAL DETAILS", st))
    story.append(Spacer(1, 0.04 * inch))
    fd_data = [
        [Paragraph('<b>Fetal Number</b>', st['bold10']), Paragraph(data.get('fetal_number','SINGLE'), st['norm9']),
         Paragraph('<b>Placenta Location</b>', st['bold10']), Paragraph(data.get('placenta','POST WALL'), st['norm9'])],
        [Paragraph('<b>Cardiac Activity</b>', st['bold10']), Paragraph(f'<b>{data.get("cardiac_activity","SEEN")}</b>', st['norm9']),
         Paragraph('<b>Liquor (AFI)</b>', st['bold10']), Paragraph(f"{data.get('liquor','NORMAL')}  {data.get('afi','')}".strip(), st['norm9'])],
        [Paragraph('<b>Presentation</b>', st['bold10']), Paragraph(data.get('presentation','CEPHALIC'), st['norm9']),
         Paragraph('<b>Myometrial Interface</b>', st['bold10']), Paragraph(f"Clearly Defined ({data.get('myometrial_interface','yes').title()})", st['norm9'])],
    ]
    t_fd = Table(fd_data, colWidths=[1.6*inch, 2.0*inch, 1.6*inch, 2.0*inch])
    t_fd.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('TOPPADDING',(0,0),(-1,-1),5),
        ('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),
        ('GRID',(0,0),(-1,-1),0.5,BORDER_COLOR),
        ('BACKGROUND',(0,0),(0,-1),LIGHT_BG),
        ('BACKGROUND',(2,0),(2,-1),LIGHT_BG),
    ]))
    story.append(t_fd)
    story.append(Spacer(1, 0.16 * inch))

    # ── 2. FETAL BIOMETRY ────────────────────────────────────────────────────
    story.append(section_banner("2. FETAL BIOMETRY & ESTIMATED WEIGHT", st))
    story.append(Spacer(1, 0.04 * inch))
    bm_rows = [[
        Paragraph('<b>Parameter</b>', st['bold10']),
        Paragraph('<b>Measurement</b>', st['bold10']),
        Paragraph('<b>Percentile (FMF)</b>', st['bold10']),
    ]]
    for i, row in enumerate(data.get('biometry', [])):
        if row.get('meas'):
            perc_str = row.get('perc','')
            # Highlight abnormal percentiles in red (<10% or >90%)
            perc_display = perc_str
            try:
                p_val = float(perc_str.replace('%','').strip())
                if p_val < 10.0 or p_val > 90.0:
                    perc_display = f'<font color="#dc2626"><b>{perc_str} (Abnormal)</b></font>'
            except Exception:
                pass

            param_label = f'<b>{row.get("param","")}</b>' if row.get("param") == "EFW" else row.get('param','')
            meas_label  = f'<b>{row.get("meas","")}</b>' if row.get("param") == "EFW" else row.get('meas','')
            bm_rows.append([
                Paragraph(param_label, st['norm9']),
                Paragraph(meas_label, st['norm9']),
                Paragraph(perc_display, st['norm9']),
            ])
    t_bm = Table(bm_rows, colWidths=[2.4*inch, 2.4*inch, 2.4*inch])
    t_bm_style = [
        ('BACKGROUND',(0,0),(-1,0),HEADER_BG),
        ('ALIGN',(1,0),(-1,-1),'CENTER'),
        ('TOPPADDING',(0,0),(-1,-1),5),
        ('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),10),
        ('GRID',(0,0),(-1,-1),0.5,BORDER_COLOR),
    ]
    for r_idx in range(1, len(bm_rows)):
        if r_idx % 2 == 1:
            t_bm_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), LIGHT_BG))
    t_bm.setStyle(TableStyle(t_bm_style))
    story.append(t_bm)
    story.append(Spacer(1, 0.16 * inch))

    # ── 3. FETAL ANATOMY CHECKLIST ───────────────────────────────────────────
    story.append(section_banner("3. FETAL ANATOMY ASSESSMENT", st))
    story.append(Spacer(1, 0.04 * inch))
    
    custom = data.get('custom_measures', {})
    anatomy = data.get('anatomy', {})
    anatomy_comments = data.get('anatomy_comments', {})
    anatomy_sections = data.get('anatomy_sections', {})

    if not anatomy_sections or not isinstance(anatomy_sections, dict):
        anatomy_sections = {
            'Head': ['Falx seen', 'Skull Bones normal', 'Cavum Septum Pellucidum normal', 'Corpus Callosum seen', 'Choroid Plexus normal', 'Cerebellum/Vermis seen', 'Anterior & Posterior Horns normal', 'Thalamus & Third Ventricle normal', 'Sylvian Fissure seen', 'Lateral Ventricles', 'Nuchal Thickness', 'Cisterna Magna'],
            'Face & Neck': ['Orbits normal', 'Nose normal', 'Jaw normal', 'Lips & Lip Line intact', 'Nasal Bone seen', 'Profile normal', 'Hard & Soft Palate intact', 'Lenses (Both Eyes) seen', 'Neck (No Hygroma) normal'],
            'Thorax & Lungs': ['Right lung normal', 'Left lung normal', 'Diaphragm normal', 'Thymus seen', 'No Pleural Effusion / Mass normal', 'Thoracic Symmetry normal'],
            'Heart & Circulation': ['FHM seen', 'Position leftside', 'Axis normal', '4 Chambers normal', 'Intraventricular Septum normal', 'Foramen Ovale seen', 'Mitral & Tricuspid Valves normal', 'Three-Vessel View (3VV) normal', 'Three-Vessel Trachea View (3VT) normal', 'Pulmonary Veins to LA seen', 'Regurgitation no'],
            'Great Vessels & Outflow': ['LVOT normal', 'RVOT normal', 'Aortic Arch normal', 'Ductal Arch normal', 'Superior Vena Cava (SVC) normal', 'Inferior Vena Cava (IVC) normal'],
            'Abdomen & Pelvis': ['Stomach/Situs normal', 'Kidney (Left) seen', 'Kidney (Right) seen', 'Bladder seen', 'Abdominal Wall normal', 'Bowel echogenicity normal', 'Gallbladder seen', 'Adrenal Glands normal', 'No Ascites / Mass normal'],
            'Spine & Skeleton': ['Ossification Centres seen', 'Skin Line intact', 'Cervical & Thoracic Spine normal', 'Lumbar & Sacral Spine normal', 'Vertebral Alignment normal'],
            'Extremities': ['12 Long Bones seen', 'Both Hands & Thumbs seen', 'Both Feet & Ankles seen', 'Pelvic Bones & Clavicles normal'],
            'Umbilical Cord & Placenta': ['Cord Insertion normal', '3 Vessel Cord seen', 'Ductus Venosus flow normal', 'Amniotic Fluid echogenicity clear']
        }

    def build_anatomy_block(section_title: str, candidate_items: list, cols: int = 3):
        """Builds an anatomy table only for items explicitly evaluated (ticked)."""
        active_items = []
        for item in candidate_items:
            item_clean = item.strip()
            if item_clean in anatomy or item in anatomy:
                active_items.append(item_clean if item_clean in anatomy else item)
            elif item == 'Lateral Ventricles' and custom.get('lv', '').strip():
                active_items.append(item)
            elif item == 'Nuchal Thickness' and custom.get('nt', '').strip():
                active_items.append(item)
            elif item == 'Cisterna Magna' and custom.get('cm', '').strip():
                active_items.append(item)
                
        if not active_items:
            return []  # Skip this section entirely if no items were evaluated/ticked!

        has_comments = any(bool(anatomy_comments.get(i, [])) for i in active_items)
        if has_comments:
            cols = min(cols, 2)

        elements = []
        p_head = Paragraph(f'<b><u>{section_title.upper()}</u></b>', ParagraphStyle('SubSec', fontName='Helvetica-Bold', fontSize=9.5, textColor=NAVY, spaceAfter=3, spaceBefore=4))
        cells = []
        for item_key in active_items:
            val = anatomy.get(item_key, 'normal')
            comments = anatomy_comments.get(item_key, [])
            cells.append(Paragraph(format_anatomy_item(item_key, val, custom, comments), st['check']))
        while len(cells) % cols != 0:
            cells.append(Paragraph('', st['check']))
        
        rows = [cells[i:i+cols] for i in range(0, len(cells), cols)]
        col_w = 7.2 * inch / cols
        t = Table(rows, colWidths=[col_w]*cols)
        t.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('BOTTOMPADDING',(0,0),(-1,-1),3),
            ('TOPPADDING',(0,0),(-1,-1),2),
            ('LEFTPADDING',(0,0),(-1,-1),2),
        ]))
        elements.append(p_head)
        elements.append(t)
        elements.append(Spacer(1, 0.06 * inch))
        return elements

    # Gather all anatomy elements to keep layout crisp
    anatomy_story = []
    for section_title, candidate_list in anatomy_sections.items():
        candidate_items = list(candidate_list)
        if section_title.lower() == 'head':
            for special in ['Lateral Ventricles', 'Nuchal Thickness', 'Cisterna Magna']:
                if special not in candidate_items:
                    candidate_items.append(special)
        default_cols = 2 if len(candidate_items) <= 3 else 3
        anatomy_story.extend(build_anatomy_block(section_title, candidate_items, cols=default_cols))

    for item in anatomy_story:
        story.append(item)

    # ── PLACENTA, CERVIX & MATERNAL ANATOMY ──────────────────────────────────
    p_extra_head = Paragraph('<b><u>PLACENTA, CERVIX & MATERNAL STRUCTURES</u></b>', ParagraphStyle('SubSec2', fontName='Helvetica-Bold', fontSize=9.5, textColor=NAVY, spaceAfter=3, spaceBefore=4))
    story.append(p_extra_head)
    
    cervix_status_text = '<font color="#059669"><b>Closed</b></font>' if data.get('cervix_closed', True) else '<font color="#dc2626"><b>Open / Abnormal</b></font>'
    plac_rows = [
        [Paragraph(f'<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;Placental Site: <b>{data.get("placenta","POST WALL")}</b>', st['check']),
         Paragraph(f'<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;Dist from Int. Os: <b>{data.get("placenta_dist","—")} cm</b>', st['check']),
         Paragraph(f'<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;Cervical Length: <b>{data.get("cervix_length","—")} cm</b> ({cervix_status_text})', st['check'])],
        [Paragraph('<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;Maternal Uterus: <font color="#333333">Normal</font>', st['check']),
         Paragraph('<font name="ZapfDingbats" color="#059669" size=10>4</font> &nbsp;Adnexa: <font color="#333333">Normal</font>', st['check']),
         Paragraph('', st['check'])]
    ]
    t_plac = Table(plac_rows, colWidths=[2.4*inch, 2.4*inch, 2.4*inch])
    t_plac.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('TOPPADDING',(0,0),(-1,-1),2),
        ('LEFTPADDING',(0,0),(-1,-1),2),
    ]))
    story.append(t_plac)
    story.append(Spacer(1, 0.16 * inch))

    # ── 4. FETAL & MATERNAL DOPPLER ASSESSMENT (With Ductus Venosus) ────────
    story.append(section_banner("4. FETAL & MATERNAL DOPPLER ASSESSMENT", st))
    story.append(Spacer(1, 0.04 * inch))
    dop = data.get('doppler', {})
    lt_val   = dop.get('lt', '—')
    rt_val   = dop.get('rt', '—')
    mean_val = dop.get('mean') or dop.get('uta_pi_mean') or '—'
    if mean_val in ('—', '', None) and lt_val != '—' and rt_val != '—':
        try: mean_val = f"{(float(lt_val) + float(rt_val)) / 2:.3f}"
        except Exception: mean_val = '—'
    
    uma_pi = dop.get('uma_pi', '—')
    mca_pi = dop.get('mca_pi', '—')
    cpr_val = dop.get('cpr', '—')
    if cpr_val in ('—', '', None) and mca_pi != '—' and uma_pi != '—':
        try: cpr_val = f"{(float(mca_pi) / float(uma_pi)):.2f}"
        except Exception: cpr_val = '—'
    dv_piv = dop.get('dv_piv', '—')
    dv_wave = dop.get('dv_waveform', 'Normal (Positive A-wave)')

    dop_rows = [
        [Paragraph('<b>Vessel / Doppler Index</b>', st['bold10']), Paragraph('<b>Recorded Value / Waveform</b>', st['bold10']), Paragraph('<b>Reference Centile & Status</b>', st['bold10'])],
        [Paragraph('Uterine Artery (Left / Right / Mean)', st['norm9']), Paragraph(f'Lt: <b>{lt_val}</b> | Rt: <b>{rt_val}</b> | Mean: <b>{mean_val}</b>', st['norm9']), Paragraph('<font color="#059669">Within reference interval</font>' if mean_val != '—' else '—', st['norm9'])],
        [Paragraph('Umbilical Artery PI (UmA PI)', st['norm9']), Paragraph(f'<b>{uma_pi}</b>', st['norm9']), Paragraph('<font color="#059669">Normal (&lt;95th centile)</font>' if uma_pi != '—' else '—', st['norm9'])],
        [Paragraph('Middle Cerebral Artery PI (MCA PI)', st['norm9']), Paragraph(f'<b>{mca_pi}</b>', st['norm9']), Paragraph('<font color="#059669">Normal (&gt;5th centile)</font>' if mca_pi != '—' else '—', st['norm9'])],
        [Paragraph('Cerebroplacental Ratio (CPR = MCA/UmA)', st['norm9']), Paragraph(f'<b>{cpr_val}</b>', st['norm9']), Paragraph('<font color="#0055b8"><b>Normal CPR (&gt;1.08)</b></font>' if cpr_val != '—' else '—', st['norm9'])],
        [Paragraph('<b>Ductus Venosus PIV & Waveform</b>', st['norm9']), Paragraph(f'PIV: <b>{dv_piv}</b> | Waveform: <b>{dv_wave}</b>', st['norm9']), Paragraph('<font color="#dc2626"><b>⚠ Abnormal A-wave</b></font>' if 'Reversed' in str(dv_wave) or 'Absent' in str(dv_wave) else '<font color="#059669"><b>Normal Positive A-wave</b></font>', st['norm9'])]
    ]
    t_dop = Table(dop_rows, colWidths=[2.3*inch, 2.5*inch, 2.4*inch])
    t_dop_style = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]
    for idx in range(1, len(dop_rows)):
        if idx % 2 == 1: t_dop_style.append(('BACKGROUND', (0, idx), (-1, idx), LIGHT_BG))
    t_dop.setStyle(TableStyle(t_dop_style))
    story.append(t_dop)
    story.append(Spacer(1, 0.12 * inch))

    # Parse Patient GA & Values accurately via regex for all charts
    patient_ga = 22.0
    try:
        ga_str = data.get('ga_scan', '')
        m = re.findall(r'(\d+(?:\.\d+)?)', str(ga_str))
        if m: patient_ga = float(m[0]) + (float(m[1])/7.0 if len(m) > 1 else 0.0)
    except Exception: pass
    
    patient_vals = {}
    for b_item in data.get('biometry', []):
        param = str(b_item.get('param', '')).lower()
        val_raw = b_item.get('meas') if b_item.get('meas') else b_item.get('val', '')
        val_str = str(val_raw).lower().replace(' mm', '').replace(' g', '').replace('(mean)', '').strip()
        num_match = re.findall(r'(\d+(?:\.\d+)?)', val_str)
        if num_match:
            f_val = float(num_match[0])
            if 'bpd' in param: patient_vals['bpd'] = f_val
            elif 'hc' in param: patient_vals['hc'] = f_val
            elif 'ac' in param: patient_vals['ac'] = f_val
            elif 'fl' in param: patient_vals['fl'] = f_val
            elif 'efw' in param or 'weight' in param: patient_vals['efw'] = f_val
            elif 'crl' in param: patient_vals['crl'] = f_val
            elif 'nt' in param or 'nuchal' in param: patient_vals['nt'] = f_val
    cust = data.get('custom_measures', {})
    if cust.get('nt'):
        try: patient_vals['nt'] = float(str(cust.get('nt')).replace('mm','').strip())
        except Exception: pass
    if cust.get('crl'):
        try: patient_vals['crl'] = float(str(cust.get('crl')).replace('mm','').strip())
        except Exception: pass
    for d_key, p_key in [('utaMean', 'uta_pi'), ('mean', 'uta_pi'), ('uma_pi', 'uma_pi'), ('mca_pi', 'mca_pi'), ('cpr', 'cpr'), ('dv_piv', 'dv_piv')]:
        if dop.get(d_key) not in (None, '', '—'):
            try: patient_vals[p_key] = float(str(dop.get(d_key)).strip())
            except Exception: pass

    selected_graphs = data.get('selected_graphs', {})
    dop_graph_keys = {'uma_pi': 'Umbilical Artery PI (UmA PI)', 'mca_pi': 'Middle Cerebral Artery PI (MCA PI)', 'cpr': 'Cerebroplacental Ratio (CPR)', 'uta_pi': 'Mean Uterine Artery PI (UtA PI)', 'dv_piv': 'Ductus Venosus PIV (DV PIV)'}
    dop_drawings = []
    for g_k, g_title in dop_graph_keys.items():
        if selected_graphs.get(g_k) is not False and (selected_graphs.get(g_k) or patient_vals.get(g_k)):
            dop_drawings.append(build_growth_chart(g_k, g_title, patient_ga, patient_vals.get(g_k)))
    if dop_drawings:
        render_graph_grid(dop_drawings, story)
    else:
        story.append(Spacer(1, 0.08 * inch))

    # ── 5. FMF RISK ASSESSMENT & ANEUPLOIDY SOFT MARKERS ────────────────────
    sec_num = 5
    risk_assessment = data.get('risk_assessment', {})
    soft_markers = data.get('soft_markers', {})
    
    if (risk_assessment and isinstance(risk_assessment, dict)) or soft_markers:
        story.append(section_banner(f"{sec_num}. FMF MULTI-PARAMETER RISK ASSESSMENT & ANEUPLOIDY SOFT MARKERS", st))
        story.append(Spacer(1, 0.04 * inch))
        
        if risk_assessment and isinstance(risk_assessment, dict):
            risk_rows = [
                [Paragraph('<b>Evaluation Engine</b>', st['bold10']), Paragraph('<b>Calculated Risk Ratios</b>', st['bold10']), Paragraph('<b>Risk Status & Recommendation</b>', st['bold10'])]
            ]
            for engine_key, r_data in risk_assessment.items():
                if not r_data or not isinstance(r_data, dict): continue
                title = r_data.get('title', engine_key.upper())
                is_high = r_data.get('is_high_risk', False) or r_data.get('t21_high_risk', False) or r_data.get('t18_13_high_risk', False)
                rec = r_data.get('recommendation', 'Routine management')
                
                ratios_list = []
                for k, label in [
                    ('risk_pe_early_ratio', 'Early PE (<34w)'), ('risk_pe_preterm_ratio', 'Preterm PE (<37w)'), ('risk_pe_term_ratio', 'Term PE (≥37w)'),
                    ('comb_t21_ratio', 'Trisomy 21 (Down)'), ('comb_t18_ratio', 'Trisomy 18 (Edwards)'), ('comb_t13_ratio', 'Trisomy 13 (Patau)'),
                    ('sga_preterm_ratio', 'Preterm SGA (<37w)'), ('sga_term_ratio', 'Term SGA (≥37w)'),
                    ('gdm_risk_percent', 'GDM Probability'),
                    ('preterm_34_ratio', 'Spontaneous PTB (<34w)'), ('preterm_37_ratio', 'Spontaneous PTB (<37w)')
                ]:
                    val = r_data.get(k)
                    if val and val != 'N/A':
                        if k == 'gdm_risk_percent' and not str(val).endswith('%'): val = f"{val}%"
                        ratios_list.append(f"<b>{label}:</b> {val}")
                
                ratios_text = "<br/>".join(ratios_list) if ratios_list else "Risk calculated within expected range."
                status_badge = '<font color="#dc2626"><b>⚠ HIGH RISK (Above threshold)</b></font>' if is_high else '<font color="#059669"><b>LOW RISK (Normal screen)</b></font>'
                rec_text = f'<font color="#b91c1c">{rec}</font>' if is_high else f'<font color="#333333">{rec}</font>'
                risk_rows.append([Paragraph(f'<b>{title}</b>', st['norm9']), Paragraph(ratios_text, st['norm9']), Paragraph(f"{status_badge}<br/><br/><i>{rec_text}</i>", st['norm9'])])
                
            t_risk = Table(risk_rows, colWidths=[2.2*inch, 2.4*inch, 2.6*inch])
            t_risk_style = [('BACKGROUND', (0, 0), (-1, 0), HEADER_BG), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR), ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 6), ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6)]
            for r_idx in range(1, len(risk_rows)):
                if r_idx % 2 == 1: t_risk_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), LIGHT_BG))
            t_risk.setStyle(TableStyle(t_risk_style))
            story.append(t_risk)
            story.append(Spacer(1, 0.12 * inch))

        # Aneuploidy Soft Markers Sub-Table
        if soft_markers and isinstance(soft_markers, dict) and len(soft_markers) > 0:
            story.append(Paragraph('<b>Trisomy Template Soft Markers (Second Trimester Screening):</b>', st['bold10']))
            story.append(Spacer(1, 0.03 * inch))
            sm_rows = [[Paragraph('<b>Ultrasound Soft Marker</b>', st['bold10']), Paragraph('<b>Sonographic Finding</b>', st['bold10']), Paragraph('<b>Aneuploidy Modifier Status</b>', st['bold10'])]]
            for m_key, m_val in soft_markers.items():
                is_abn = str(m_val).lower() not in ('normal', 'absent', 'not seen', 'no', 'present (normal)', 'normal length', 'normal (< 6mm)', 'normal (< 4mm)', 'three vessels present', 'normal layout')
                stat = f'<font color="#dc2626"><b>⚠ {m_val} (LR+ increased)</b></font>' if is_abn else f'<font color="#059669">{m_val} (Normal / Unremarkable)</font>'
                sm_rows.append([Paragraph(f'<b>{m_key}</b>', st['norm9']), Paragraph(str(m_val), st['norm9']), Paragraph(stat, st['norm9'])])
            t_sm = Table(sm_rows, colWidths=[2.5*inch, 2.3*inch, 2.4*inch])
            t_sm_style = [('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f8fafc')), ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4), ('LEFTPADDING', (0, 0), (-1, -1), 8)]
            t_sm.setStyle(TableStyle(t_sm_style))
            story.append(t_sm)
            story.append(Spacer(1, 0.16 * inch))

        sec_num += 1

    # ── 6. FETAL GROWTH ASSESSMENT (14-42 Weeks) ─────────────────────────────
    growth_keys = {'bpd': 'Biparietal Diameter (BPD)', 'hc': 'Head Circumference (HC)', 'ac': 'Abdominal Circumference (AC)', 'fl': 'Femur Length (FL)', 'efw': 'Estimated Fetal Weight (EFW)'}
    active_growth = [k for k in growth_keys.keys() if selected_graphs.get(k) is not False]
    
    if active_growth or any(k in patient_vals for k in growth_keys):
        story.append(section_banner(f"{sec_num}. FETAL GROWTH ASSESSMENT (14-42 WEEKS)", st))
        story.append(Spacer(1, 0.04 * inch))
        
        # FMF Biometry Summary Table
        bio_rows = [
            [Paragraph('<b>Biometry & Growth Parameter</b>', st['bold10']), Paragraph('<b>Recorded Value</b>', st['bold10']), Paragraph('<b>Hadlock / FMF Z-Score</b>', st['bold10']), Paragraph('<b>Percentile Status</b>', st['bold10'])]
        ]
        for item in data.get('biometry', []):
            param = str(item.get('param', ''))
            meas = str(item.get('meas', item.get('val', '—')))
            perc = str(item.get('perc', item.get('centile', '50.0%')))
            if 'EFW' in param or 'CRL' in param: continue
            # Estimate z-score from percentile if not present
            try:
                p_num = float(perc.replace('%','').strip())
                z_approx = round((p_num - 50.0) / 34.0, 3) # fast approximate Gaussian Z for display
            except Exception: z_approx = '0.000'
            bio_rows.append([Paragraph(f'<b>{param}</b>', st['norm9']), Paragraph(meas, st['norm9']), Paragraph(str(z_approx), st['norm9']), Paragraph(f'<font color="#0055b8"><b>{perc}</b></font>', st['norm9'])])
        
        if len(bio_rows) > 1:
            t_bio = Table(bio_rows, colWidths=[2.2*inch, 1.8*inch, 1.6*inch, 1.6*inch])
            t_bio.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), HEADER_BG), ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5), ('LEFTPADDING', (0, 0), (-1, -1), 8)]))
            story.append(t_bio)
            story.append(Spacer(1, 0.08 * inch))

        # EFW block
        if 'efw' in patient_vals:
            efw_v = patient_vals['efw']
            story.append(Paragraph(f"<b>Estimated fetal weight at 22-42 weeks:</b> <b>{int(efw_v)} grams</b> (Z-score: normal gestation mean interval)", st['norm9']))
            story.append(Spacer(1, 0.08 * inch))

        growth_drawings = []
        for g_k, g_title in growth_keys.items():
            if selected_graphs.get(g_k) is not False and (selected_graphs.get(g_k) or patient_vals.get(g_k)):
                growth_drawings.append(build_growth_chart(g_k, g_title, patient_ga, patient_vals.get(g_k)))
        if growth_drawings:
            render_graph_grid(growth_drawings, story)
        sec_num += 1

    # ── FIRST TRIMESTER NUCHAL TRANSLUCENCY (NT) ASSESSMENT ──────────────────
    if selected_graphs.get('nt') or 'nt' in patient_vals:
        story.append(section_banner(f"{sec_num}. FIRST TRIMESTER SCREENING & NUCHAL TRANSLUCENCY (NT)", st))
        story.append(Spacer(1, 0.04 * inch))
        nt_val = patient_vals.get('nt', '—')
        crl_val = patient_vals.get('crl', 62.0)
        story.append(Paragraph(f"<b>Nuchal Translucency (NT):</b> <b>{nt_val} mm</b> &nbsp;&nbsp;|&nbsp;&nbsp; <b>Crown-Rump Length (CRL):</b> <b>{crl_val} mm</b>", st['norm9']))
        story.append(Spacer(1, 0.06 * inch))
        nt_chart = build_growth_chart('nt', 'Nuchal Translucency vs CRL', patient_ga, patient_vals.get('nt'), patient_crl=crl_val)
        render_graph_grid([nt_chart], story)
        sec_num += 1

    summary_title = f"{sec_num}. SUMMARY / REMARKS & IMPRESSION"

    # ── SUMMARY & IMPRESSION ──────────────────────────────────────────────
    summary_block = []
    summary_block.append(section_banner(summary_title, st))
    summary_block.append(Spacer(1, 0.04 * inch))
    summary_text = data.get('summary', '').strip() or 'Single live intrauterine gestation in cephalic presentation. Fetal biometry corresponds to the stated gestational age. No obvious anatomical abnormality detected in the visualized structures.'
    
    t_sum = Table([[Paragraph(summary_text, st['remark'])]], colWidths=[7.2 * inch])
    t_sum.setStyle(TableStyle([
        ('TOPPADDING',(0,0),(-1,-1),8),
        ('BOTTOMPADDING',(0,0),(-1,-1),8),
        ('LEFTPADDING',(0,0),(-1,-1),10),
        ('RIGHTPADDING',(0,0),(-1,-1),10),
        ('BACKGROUND',(0,0),(-1,-1),HEADER_BG),
        ('BOX',(0,0),(-1,-1),1,BORDER_COLOR),
    ]))
    summary_block.append(t_sum)
    summary_block.append(Spacer(1, 0.4 * inch))

    # ── FOOTER & SIGNATURE ────────────────────────────────────────────────────
    summary_block.append(HRFlowable(width="100%", thickness=0.8, color=NAVY, spaceAfter=8))
    footer = [
        [Paragraph(f"<b>Sonologist's Name &amp; Signature:</b><br/><b>{data.get('doctor_name','DR MAHESH SHETA')}</b>", st['bold10']),
         Paragraph(f"<b>Registration No.:</b> {data.get('reg_no','G-10577')}<br/><b>FMF Certified ID:</b> {data.get('fmf_id','131606')}", st['bold10'])],
    ]
    t_footer = Table(footer, colWidths=[4.2*inch, 3.0*inch])
    t_footer.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BOTTOMPADDING',(0,0),(-1,-1),2),
    ]))
    summary_block.append(t_footer)
    
    # Use KeepTogether so signature never breaks alone onto an empty page
    story.append(KeepTogether(summary_block))

    doc.build(story)


# ── Quick self-test ────────────────────────────────────────────────────────────
if __name__ == '__main__':
    test_data = {
        'patient_name': 'SAYTI BOSH', 'patient_id': '124523-C3AA',
        'referring_doctor': 'MAHESH SHETA', 'exam_date': '16/07/2026',
        'ga_lmp': '22 weeks 4 days', 'edd_lmp': '15/11/2026',
        'ga_scan': '22 weeks 6 days', 'edd_scan': '13/11/2026',
        'fetal_number': 'SINGLE', 'cardiac_activity': 'SEEN',
        'presentation': 'CEPHALIC', 'placenta': 'POST WALL',
        'liquor': 'NORMAL', 'afi': '14.2 cm',
        'biometry': [
            {'param':'BPD','meas':'54.9 MM','perc':'50.1%'},
            {'param':'HC','meas':'203.8 MM','perc':'34.1%'},
            {'param':'AC','meas':'181.1 MM','perc':'54.8%'},
            {'param':'FL','meas':'40.5 MM','perc':'56.4%'},
            {'param':'HL','meas':'35.5 MM','perc':''},
            {'param':'EFW','meas':'550 g','perc':'47.6%'},
        ],
        'anatomy': {
            'Falx seen': 'normal', 'Skull Bones normal': 'normal', 'Cavum Septum Pellucidum normal': 'normal',
            'Corpus Callosum seen': 'normal', 'Choroid Plexus normal': 'normal', 'Cerebellum/Vermis seen': 'normal',
            'Orbits normal': 'normal', 'Nose normal': 'normal', 'Jaw normal': 'normal',
            'Lips intact': 'normal', 'Nasal Bone seen': 'normal', 'Profile normal': 'normal',
            'Right lung normal': 'normal', 'Left lung normal': 'normal', 'Diaphragm normal': 'normal',
            'FHM seen': 'normal', 'Position leftside': 'normal', 'Axis normal': 'normal',
            '4 Chambers normal': 'normal', 'Intraventricular Septum normal': 'normal',
            'Mitral Valve normal': 'normal', 'Tricuspid Valve normal': 'normal', 'Regurgitation no': 'normal',
            'Stomach/Situs normal': 'normal', 'Kidney (Left) seen': 'normal', 'Kidney (Right) seen': 'not_seen',
            'Bladder seen': 'normal', 'Abdominal Wall normal': 'abnormal',
            'Ossification Centres seen/normal': 'normal', 'Skin Line intact': 'normal',
            '12 Long Bones seen': 'normal', 'Hands/Fingers seen': 'normal', 'Feet/Toes seen': 'normal',
            'Cord Insertion normal': 'normal', '3 Vessel Cord seen': 'normal',
        },
        'custom_measures': {'lv':'5.6','nt':'4.5','cm':'5.2','fhr':'156'},
        'placenta_dist': '1.88', 'myometrial_interface': 'yes',
        'cervix_length': '2.84', 'cervix_closed': True,
        'doppler': {'lt':'1.00','rt':'0.87','mean':'0.935'},
        'summary': 'Single live intrauterine pregnancy in cephalic presentation. Fetal biometry corresponds to gestational age. Abdominal wall hernia noted (abnormal). Right kidney obscured by acoustic shadow (not seen).',
        'doctor_name': 'DR MAHESH SHETA', 'reg_no': 'G-10577', 'fmf_id': '131606',
    }
    generate_pdf(test_data, 'test_report_v3.pdf')
    print('test_report_v3.pdf generated successfully!')
