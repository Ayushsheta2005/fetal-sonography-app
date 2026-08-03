from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional
import uvicorn
import tempfile
import os

from app.engine.fmf import FMFEngine, FMFRiskEngine
from app.engine.pdf_generator import generate_pdf

app = FastAPI(
    title="Fetal Sonography Reporting Platform",
    description="FMF-based Calculation Engine for Fetal Biometry, Dopplers, and Risk Assessment",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Schemas ──────────────────────────────────────────────────────────────────

class BiometryInput(BaseModel):
    ga_days: float = Field(..., description="Gestational age in days")
    hc_mm: Optional[float] = None
    ac_mm: Optional[float] = None
    fl_mm: Optional[float] = None
    bpd_mm: Optional[float] = None

class BiometryResult(BaseModel):
    hc_z: Optional[float] = None
    hc_p: Optional[float] = None
    ac_z: Optional[float] = None
    ac_p: Optional[float] = None
    fl_z: Optional[float] = None
    fl_p: Optional[float] = None
    bpd_z: Optional[float] = None
    bpd_p: Optional[float] = None
    efw_grams: Optional[float] = None
    efw_z: Optional[float] = None
    efw_p: Optional[float] = None
    efw_category: Optional[str] = None  # SGA / AGA / LGA

class DopplerInput(BaseModel):
    ga_weeks: float
    mca_psv: Optional[float] = None
    uta_pi_left: Optional[float] = None
    uta_pi_right: Optional[float] = None

class DopplerResult(BaseModel):
    mca_psv_expected: Optional[float] = None
    mca_psv_mom: Optional[float] = None
    mca_anemia_category: Optional[str] = None
    uta_pi_mean: Optional[float] = None

class PreeclampsiaInput(BaseModel):
    age: float = 30
    bmi: float = 24.0
    ethnicity: str = 'Caucasian'
    chronic_htn: bool = False
    prev_pe: bool = False
    diabetes: bool = False
    nulliparous: bool = True
    smoking: bool = False
    family_hx_pe: bool = False
    sle_aps: bool = False
    map_mmHg: Optional[float] = None
    uta_pi_mom: Optional[float] = None
    plgf_mom: Optional[float] = None
    pappa_mom: Optional[float] = None

class TrisomyInput(BaseModel):
    maternal_age: float = 30
    ga_weeks: float = 12.0
    crl_mm: float = 60.0
    nt_mm: float = 1.6
    fhr_bpm: float = 160
    free_hcg_mom: float = 1.0
    pappa_mom: float = 1.0
    nasal_bone: str = 'normal'
    tr_regurgitation: bool = False
    dv_reversed: bool = False

class SGAInput(BaseModel):
    maternal_age: float = 30
    bmi: float = 24.0
    ethnicity: str = 'Caucasian'
    smoking: bool = False
    nulliparous: bool = True
    prev_sga: bool = False
    chronic_htn: bool = False
    efw_centile: Optional[float] = 50.0
    uta_pi_mom: Optional[float] = 1.0
    plgf_mom: Optional[float] = 1.0

class GDMInput(BaseModel):
    maternal_age: float = 30
    bmi: float = 24.0
    ethnicity: str = 'Caucasian'
    family_hx_diabetes: bool = False
    prev_gdm: bool = False
    prev_macrosomia: bool = False

class PretermInput(BaseModel):
    cervical_length_mm: Optional[float] = 35.0
    prev_preterm_34: bool = False
    prev_preterm_37: bool = False
    cervical_surgery: bool = False

class ReportInput(BaseModel):
    patient_name: str
    patient_id: str
    referring_doctor: str
    exam_date: str
    ga_lmp: str
    edd_lmp: str
    ga_scan: str
    edd_scan: str
    fetal_number: Optional[str] = "SINGLE"
    cardiac_activity: Optional[str] = "SEEN"
    presentation: Optional[str] = "CEPHALIC"
    placenta: Optional[str] = "POST WALL"
    liquor: Optional[str] = "NORMAL"
    afi: Optional[str] = ""
    biometry: Optional[list] = []
    anatomy: Optional[dict] = {}
    anatomy_comments: Optional[dict] = {}
    anatomy_sections: Optional[dict] = {}
    custom_measures: Optional[dict] = {}
    placenta_dist: Optional[str] = ""
    myometrial_interface: Optional[str] = "yes"
    cervix_length: Optional[str] = ""
    cervix_closed: Optional[bool] = True
    doppler: Optional[dict] = {}
    risk_assessment: Optional[dict] = {}
    selected_graphs: Optional[dict] = {}
    soft_markers: Optional[dict] = {}
    soft_marker_custom: Optional[dict] = {}
    summary: Optional[str] = ""
    doctor_name: Optional[str] = ""
    reg_no: Optional[str] = ""
    fmf_id: Optional[str] = ""

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

@app.post("/calculate/biometry", response_model=BiometryResult)
def calculate_biometry(data: BiometryInput):
    r = BiometryResult()

    if data.hc_mm:
        r.hc_z = FMFEngine.hc_zscore(data.hc_mm, data.ga_days)
        r.hc_p = FMFEngine.get_centile(r.hc_z)

    if data.ac_mm:
        r.ac_z = FMFEngine.ac_zscore(data.ac_mm, data.ga_days)
        r.ac_p = FMFEngine.get_centile(r.ac_z)

    if data.fl_mm:
        r.fl_z = FMFEngine.fl_zscore(data.fl_mm, data.ga_days)
        r.fl_p = FMFEngine.get_centile(r.fl_z)

    if data.bpd_mm:
        r.bpd_z = FMFEngine.bpd_zscore(data.bpd_mm, data.ga_days)
        r.bpd_p = FMFEngine.get_centile(r.bpd_z)

    if data.hc_mm and data.ac_mm and data.fl_mm:
        r.efw_grams = FMFEngine.fw_from_hc_ac_fl(data.hc_mm, data.ac_mm, data.fl_mm)
        if r.efw_grams:
            r.efw_z = FMFEngine.efw_zscore(r.efw_grams, data.ga_days)
            r.efw_p = FMFEngine.get_centile(r.efw_z)
            if r.efw_p is not None:
                if r.efw_p < 10:
                    r.efw_category = "SGA"
                elif r.efw_p > 90:
                    r.efw_category = "LGA"
                else:
                    r.efw_category = "AGA"
    return r

@app.post("/calculate/doppler", response_model=DopplerResult)
def calculate_doppler(data: DopplerInput):
    r = DopplerResult()
    if data.mca_psv:
        r.mca_psv_expected = FMFEngine.mca_psv_expected(data.ga_weeks)
        if r.mca_psv_expected:
            r.mca_psv_mom = data.mca_psv / r.mca_psv_expected
            if r.mca_psv_mom < 1.0:
                r.mca_anemia_category = "Normal"
            elif r.mca_psv_mom < 1.29:
                r.mca_anemia_category = "Borderline"
            elif r.mca_psv_mom < 1.50:
                r.mca_anemia_category = "Mild Anemia"
            elif r.mca_psv_mom < 1.55:
                r.mca_anemia_category = "Moderate Anemia"
            else:
                r.mca_anemia_category = "Severe Anemia (IUT Indicated)"
    if data.uta_pi_left or data.uta_pi_right:
        r.uta_pi_mean = FMFEngine.uta_pi_mean(data.uta_pi_left, data.uta_pi_right)
    return r

# ─── Risk Endpoints ───────────────────────────────────────────────────────────

@app.post("/calculate/risk/preeclampsia")
def calc_pe_risk(data: PreeclampsiaInput):
    return FMFRiskEngine.preeclampsia_risk(
        age=data.age, bmi=data.bmi, ethnicity=data.ethnicity,
        chronic_htn=data.chronic_htn, prev_pe=data.prev_pe,
        diabetes=data.diabetes, nulliparous=data.nulliparous,
        smoking=data.smoking, family_hx_pe=data.family_hx_pe, sle_aps=data.sle_aps,
        map_mmHg=data.map_mmHg, uta_pi_mom=data.uta_pi_mom,
        plgf_mom=data.plgf_mom, pappa_mom=data.pappa_mom
    )

@app.post("/calculate/risk/trisomies")
def calc_trisomy_risk(data: TrisomyInput):
    return FMFRiskEngine.trisomies_risk(
        maternal_age=data.maternal_age, ga_weeks=data.ga_weeks,
        crl_mm=data.crl_mm, nt_mm=data.nt_mm, fhr_bpm=data.fhr_bpm,
        free_hcg_mom=data.free_hcg_mom, pappa_mom=data.pappa_mom,
        nasal_bone=data.nasal_bone, tr_regurgitation=data.tr_regurgitation, dv_reversed=data.dv_reversed
    )

@app.post("/calculate/risk/sga")
def calc_sga_risk(data: SGAInput):
    return FMFRiskEngine.sga_risk(
        maternal_age=data.maternal_age, bmi=data.bmi, ethnicity=data.ethnicity,
        smoking=data.smoking, nulliparous=data.nulliparous, prev_sga=data.prev_sga,
        chronic_htn=data.chronic_htn, efw_centile=data.efw_centile, uta_pi_mom=data.uta_pi_mom, plgf_mom=data.plgf_mom
    )

@app.post("/calculate/risk/gdm")
def calc_gdm_risk(data: GDMInput):
    return FMFRiskEngine.gdm_risk(
        maternal_age=data.maternal_age, bmi=data.bmi, ethnicity=data.ethnicity,
        family_hx_diabetes=data.family_hx_diabetes, prev_gdm=data.prev_gdm,
        prev_macrosomia=data.prev_macrosomia
    )

@app.post("/calculate/risk/preterm")
def calc_preterm_risk(data: PretermInput):
    return FMFRiskEngine.preterm_birth_risk(
        cervical_length_mm=data.cervical_length_mm,
        prev_preterm_34=data.prev_preterm_34,
        prev_preterm_37=data.prev_preterm_37,
        cervical_surgery=data.cervical_surgery
    )

@app.post("/report/pdf")
def make_pdf(data: ReportInput):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        output_path = tmp.name

    generate_pdf(data.model_dump(), output_path)

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=f"fetal_report_{data.patient_id}.pdf"
    )

@app.get("/")
@app.get("/health")
def health_check():
    """Lightweight 24/7 pinger endpoint for Uptime monitoring and Render cold-start prevention."""
    return {
        "status": "online",
        "service": "Fetal Sonography Reporting Platform API",
        "engine": "Hadlock / FMF Certified Vector Analytics",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
