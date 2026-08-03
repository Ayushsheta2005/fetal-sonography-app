from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from .engine.fmf import FMFEngine

router = APIRouter()

class BiometryInput(BaseModel):
    ga_days: float
    hc_mm: Optional[float] = None
    ac_mm: Optional[float] = None
    fl_mm: Optional[float] = None
    bpd_mm: Optional[float] = None

class BiometryOutput(BaseModel):
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

@router.post("/calculate/biometry", response_model=BiometryOutput)
def calculate_biometry(data: BiometryInput):
    out = BiometryOutput()
    
    if data.hc_mm:
        out.hc_z = FMFEngine.hc_zscore(data.hc_mm, data.ga_days)
        out.hc_p = FMFEngine.get_centile_from_z(out.hc_z)
    
    if data.ac_mm:
        out.ac_z = FMFEngine.ac_zscore(data.ac_mm, data.ga_days)
        out.ac_p = FMFEngine.get_centile_from_z(out.ac_z)
        
    if data.fl_mm:
        out.fl_z = FMFEngine.fl_zscore(data.fl_mm, data.ga_days)
        out.fl_p = FMFEngine.get_centile_from_z(out.fl_z)
        
    if data.bpd_mm:
        out.bpd_z = FMFEngine.bpd_zscore(data.bpd_mm, data.ga_days)
        out.bpd_p = FMFEngine.get_centile_from_z(out.bpd_z)
        
    if data.hc_mm and data.ac_mm and data.fl_mm:
        out.efw_grams = FMFEngine.fw_from_hc_ac_fl(data.hc_mm, data.ac_mm, data.fl_mm)
        if out.efw_grams:
            out.efw_z = FMFEngine.efw_zscore(out.efw_grams, data.ga_days)
            out.efw_p = FMFEngine.get_centile_from_z(out.efw_z)
            
    return out
