import math
from typing import Optional, Dict, Any
from scipy.stats import norm

class FMFEngine:

    @staticmethod
    def get_centile(z: float) -> Optional[float]:
        if z is None: return None
        return float(norm.cdf(z) * 100)

    # ── HC ──────────────────────────────────────────────────────────────────
    @staticmethod
    def hc_zscore(hc_mm: float, ga_days: float) -> Optional[float]:
        ga = ga_days / 7.0
        if ga >= 39.776: ga = 39.776
        if not hc_mm or hc_mm < 40 or hc_mm > 500 or ga < 12: return None
        expected = 1.3369692 + 0.0596493 * ga - 0.0007494 * ga ** 2
        measured = math.log10(hc_mm + 1)
        return (measured - expected) / 0.01997

    @staticmethod
    def expected_hc(ga_days: float) -> Optional[float]:
        ga = ga_days / 7.0
        if ga < 12: return None
        if ga >= 39.776: ga = 39.776
        return math.pow(10, 1.3369692 + 0.0596493 * ga - 0.0007494 * ga ** 2) - 1

    # ── AC ──────────────────────────────────────────────────────────────────
    @staticmethod
    def ac_zscore(ac_mm: float, ga_days: float) -> Optional[float]:
        ga = ga_days / 7.0
        if not ac_mm or ac_mm < 40 or ac_mm > 500 or ga < 12: return None
        expected = 1.3257977 + 0.0552337 * ga - 0.0006146021 * ga ** 2
        measured = math.log10(ac_mm + 9)
        return (measured - expected) / 0.02947

    @staticmethod
    def expected_ac(ga_days: float) -> Optional[float]:
        ga = ga_days / 7.0
        if ga < 12: return None
        return math.pow(10, 1.3257977 + 0.0552337 * ga - 0.0006146021 * ga ** 2) - 9

    # ── FL ──────────────────────────────────────────────────────────────────
    @staticmethod
    def fl_zscore(fl_mm: float, ga_days: float) -> Optional[float]:
        ga = ga_days / 7.0
        if not fl_mm or fl_mm < 5 or fl_mm > 100 or ga < 12: return None
        expected_sqrt = 0.4263429 * ga - 1.1132444 - 0.0045992 * ga ** 2
        return (math.sqrt(fl_mm) - expected_sqrt) / 0.1852

    @staticmethod
    def expected_fl(ga_days: float) -> Optional[float]:
        ga = ga_days / 7.0
        if ga < 12: return None
        s = 0.4263429 * ga - 1.1132444 - 0.0045992 * ga ** 2
        return s * s

    # ── BPD ─────────────────────────────────────────────────────────────────
    @staticmethod
    def bpd_zscore(bpd_mm: float, ga_days: float) -> Optional[float]:
        ga = ga_days / 7.0
        if not bpd_mm or ga < 12: return None
        expected = -32.81 + 4.714 * ga - 0.03671 * ga ** 2
        sd = 3.5
        if expected <= 0: return None
        return (bpd_mm - expected) / sd

    # ── EFW ─────────────────────────────────────────────────────────────────
    @staticmethod
    def fw_from_hc_ac_fl(hc_mm: float, ac_mm: float, fl_mm: float) -> Optional[float]:
        hc = hc_mm / 10.0; ac = ac_mm / 10.0; fl = fl_mm / 10.0
        if not (4 <= hc <= 50 and 4 <= ac <= 50 and 0.5 <= fl <= 10): return None
        log10_efw = 1.326 - 0.00326 * ac * fl + 0.0107 * hc + 0.0438 * ac + 0.158 * fl
        return math.pow(10, log10_efw)

    @staticmethod
    def efw_zscore(efw_g: float, ga_days: float) -> Optional[float]:
        if not efw_g or ga_days < 150: return None
        e = ga_days - 199
        expected_log = 3.0893 + 0.00835 * e - 0.00002965 * e ** 2 - 0.00000006062 * e ** 3
        sd_log = 0.02464 + 0.00000005639669 * ga_days
        return (math.log10(efw_g) - expected_log) / sd_log

    # ── Dopplers ─────────────────────────────────────────────────────────────
    @staticmethod
    def mca_psv_expected(ga_weeks: float) -> Optional[float]:
        if not (18 <= ga_weeks <= 42): return None
        return math.pow(10, 0.963 + 0.0223 * ga_weeks)

    @staticmethod
    def uta_pi_mean(left: Optional[float], right: Optional[float]) -> Optional[float]:
        vals = [v for v in [left, right] if v is not None]
        return sum(vals) / len(vals) if vals else None


# ─────────────────────────────────────────────────────────────────────────────
# ── FMF MULTI-PARAMETER RISK CALCULATORS ─────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────

class FMFRiskEngine:

    @staticmethod
    def preeclampsia_risk(
        age: float = 30,
        bmi: float = 24.0,
        ethnicity: str = 'Caucasian',
        chronic_htn: bool = False,
        prev_pe: bool = False,
        diabetes: bool = False,
        nulliparous: bool = True,
        smoking: bool = False,
        family_hx_pe: bool = False,
        sle_aps: bool = False,
        map_mmHg: Optional[float] = None,
        uta_pi_mom: Optional[float] = None,
        plgf_mom: Optional[float] = None,
        pappa_mom: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        FMF Competing Risks Model for Preeclampsia.
        Calculates Risk of PE <34w (Early), PE <37w (Preterm), and PE >=37w (Term).
        """
        # Baseline mean gestational age at delivery with PE (days) = 280
        # Log-linear hazard shift based on maternal factors:
        risk_score = 0.0
        
        # Age effect (reference 35 years)
        if age > 35: risk_score += (age - 35) * 0.04
        # BMI effect (reference 24)
        if bmi > 24: risk_score += (bmi - 24) * 0.05
        # Ethnicity
        if ethnicity in ('Black', 'Afro-Caribbean'): risk_score += 0.7
        elif ethnicity in ('South Asian', 'East Asian'): risk_score += 0.3
        
        # Medical & Obstetric History
        if chronic_htn: risk_score += 1.4
        if prev_pe: risk_score += 1.2
        if diabetes: risk_score += 0.8
        if nulliparous: risk_score += 0.4
        if smoking: risk_score -= 0.15  # Epidemiological model shift
        if family_hx_pe: risk_score += 0.5
        if sle_aps: risk_score += 1.6
        
        # Biophysical & Biochemical Markers (MoM shifts)
        if map_mmHg and map_mmHg > 95:
            risk_score += (map_mmHg - 95) * 0.03
        if uta_pi_mom and uta_pi_mom > 1.0:
            risk_score += (uta_pi_mom - 1.0) * 1.5
        if plgf_mom and plgf_mom < 1.0:
            risk_score += (1.0 - plgf_mom) * 1.8
        if pappa_mom and pappa_mom < 1.0:
            risk_score += (1.0 - pappa_mom) * 0.8

        # Competing risks transformation to probabilities
        base_early = 1.0 / (1.0 + math.exp(6.2 - risk_score))
        base_preterm = 1.0 / (1.0 + math.exp(4.5 - risk_score))
        base_term = 1.0 / (1.0 + math.exp(2.8 - risk_score))

        early_ratio = f"1 in {int(round(1.0 / max(base_early, 1e-6)))}"
        preterm_ratio = f"1 in {int(round(1.0 / max(base_preterm, 1e-6)))}"
        term_ratio = f"1 in {int(round(1.0 / max(base_term, 1e-6)))}"

        is_high_risk = base_preterm > 0.01  # >1 in 100 cut-off

        return {
            "risk_pe_early_prob": base_early,
            "risk_pe_early_ratio": early_ratio,
            "risk_pe_preterm_prob": base_preterm,
            "risk_pe_preterm_ratio": preterm_ratio,
            "risk_pe_term_prob": base_term,
            "risk_pe_term_ratio": term_ratio,
            "is_high_risk": is_high_risk,
            "recommendation": "Aspirin 150 mg nightly from 12 to 36 weeks recommended" if is_high_risk else "Standard routine antenatal care"
        }

    @staticmethod
    def trisomies_risk(
        maternal_age: float = 30,
        ga_weeks: float = 12.0,
        crl_mm: float = 60.0,
        nt_mm: float = 1.6,
        fhr_bpm: float = 160,
        free_hcg_mom: float = 1.0,
        pappa_mom: float = 1.0,
        nasal_bone: str = 'normal',
        tr_regurgitation: bool = False,
        dv_reversed: bool = False
    ) -> Dict[str, Any]:
        """
        FMF First Trimester Combined Screening for Trisomy 21, 18, and 13.
        Snijders maternal age background risk + Likelihood Ratios (NT, FHR, hCG, PAPP-A).
        """
        # Maternal age background risk for T21 at 12 weeks
        # Formula: 1 / (1 + exp(-(-12.43 + 0.154 * (age - 35) + 0.005 * (age - 35)^2)))
        age_eff = maternal_age - 35.0
        logit_t21 = -12.43 + 0.154 * age_eff + 0.005 * (age_eff ** 2)
        bg_t21_prob = 1.0 / (1.0 + math.exp(-logit_t21))

        # Expected NT for CRL (Nicolaides 1998): Log10(expected_NT) = -0.359 + 0.0127 * CRL - 0.000058 * CRL^2
        exp_nt = math.pow(10, -0.359 + 0.0127 * crl_mm - 0.000058 * (crl_mm ** 2))
        delta_nt = nt_mm - exp_nt
        
        # Likelihood ratio for NT
        lr_nt = math.exp(delta_nt * 2.2) if delta_nt > 0 else 1.0
        
        # Likelihood ratio for Biochemistry (T21: high hCG, low PAPP-A)
        lr_biochem_t21 = (free_hcg_mom / max(pappa_mom, 0.1)) ** 0.8
        
        # Ultrasound secondary clinical markers (FMF extended screening model)
        lr_nb = 6.5 if nasal_bone.lower() in ('absent', 'not seen') else 0.6
        lr_tr = 3.2 if tr_regurgitation else 0.85
        lr_dv = 3.0 if dv_reversed else 0.85
        
        comb_t21_prob = min(0.99, bg_t21_prob * lr_nt * lr_biochem_t21 * lr_nb * lr_tr * lr_dv)
        
        # Trisomy 18 & 13 background risk (~1/3 and 1/4 of T21)
        comb_t18_prob = min(0.99, (bg_t21_prob / 3.0) * lr_nt * (1.0 / max(free_hcg_mom, 0.1)) * lr_nb * lr_tr * lr_dv)
        comb_t13_prob = min(0.99, (bg_t21_prob / 4.0) * lr_nt * (1.0 / max(pappa_mom, 0.1)) * lr_nb * lr_tr * lr_dv)

        return {
            "bg_t21_ratio": f"1 in {int(round(1.0 / max(bg_t21_prob, 1e-6)))}",
            "comb_t21_ratio": f"1 in {int(round(1.0 / max(comb_t21_prob, 1e-6)))}",
            "comb_t18_ratio": f"1 in {int(round(1.0 / max(comb_t18_prob, 1e-6)))}",
            "comb_t13_ratio": f"1 in {int(round(1.0 / max(comb_t13_prob, 1e-6)))}",
            "t21_high_risk": comb_t21_prob > (1.0 / 150.0),
            "t18_13_high_risk": (comb_t18_prob > (1.0 / 150.0)) or (comb_t13_prob > (1.0 / 150.0)),
            "recommendation": "Invasive testing (CVS/Amniocentesis) or NIPT recommended" if (comb_t21_prob > 1/150 or comb_t18_prob > 1/150) else "Low Risk — Routine screening"
        }

    @staticmethod
    def sga_risk(
        maternal_age: float = 30,
        bmi: float = 24.0,
        ethnicity: str = 'Caucasian',
        smoking: bool = False,
        nulliparous: bool = True,
        prev_sga: bool = False,
        chronic_htn: bool = False,
        efw_centile: Optional[float] = 50.0,
        uta_pi_mom: Optional[float] = 1.0,
        plgf_mom: Optional[float] = 1.0
    ) -> Dict[str, Any]:
        """FMF Small for Gestational Age (SGA) / FGR Risk Model."""
        risk_score = 0.0
        if bmi < 19: risk_score += 0.5
        if smoking: risk_score += 0.9
        if nulliparous: risk_score += 0.3
        if prev_sga: risk_score += 1.3
        if chronic_htn: risk_score += 0.7
        if ethnicity in ('South Asian', 'Afro-Caribbean'): risk_score += 0.4
        
        if efw_centile is not None and efw_centile < 10:
            risk_score += (10.0 - efw_centile) * 0.3
        if uta_pi_mom and uta_pi_mom > 1.2:
            risk_score += (uta_pi_mom - 1.2) * 1.6
        if plgf_mom and plgf_mom < 0.8:
            risk_score += (0.8 - plgf_mom) * 2.0

        prob_sga_preterm = 1.0 / (1.0 + math.exp(4.8 - risk_score))
        prob_sga_term = 1.0 / (1.0 + math.exp(3.0 - risk_score))

        return {
            "sga_preterm_ratio": f"1 in {int(round(1.0 / max(prob_sga_preterm, 1e-6)))}",
            "sga_term_ratio": f"1 in {int(round(1.0 / max(prob_sga_term, 1e-6)))}",
            "is_high_risk": prob_sga_preterm > 0.02 or prob_sga_term > 0.1,
            "recommendation": "Serial growth & Doppler scans every 2-3 weeks recommended" if (prob_sga_preterm > 0.02 or prob_sga_term > 0.1) else "Routine growth monitoring"
        }

    @staticmethod
    def gdm_risk(
        maternal_age: float = 30,
        bmi: float = 24.0,
        ethnicity: str = 'Caucasian',
        family_hx_diabetes: bool = False,
        prev_gdm: bool = False,
        prev_macrosomia: bool = False
    ) -> Dict[str, Any]:
        """FMF First Trimester Screening for Gestational Diabetes Mellitus (GDM)."""
        logit = -4.2
        if maternal_age > 30: logit += (maternal_age - 30) * 0.06
        if bmi > 25: logit += (bmi - 25) * 0.12
        if ethnicity in ('South Asian', 'East Asian'): logit += 1.1
        elif ethnicity in ('Black', 'Middle Eastern'): logit += 0.7
        if family_hx_diabetes: logit += 0.8
        if prev_gdm: logit += 2.1
        if prev_macrosomia: logit += 0.6

        gdm_prob = 1.0 / (1.0 + math.exp(-logit))
        gdm_percent = gdm_prob * 100.0

        return {
            "gdm_risk_percent": round(gdm_percent, 1),
            "is_high_risk": gdm_percent >= 5.0,
            "recommendation": "Early 75g OGTT at 14-16 weeks and repeat at 24-28 weeks recommended" if gdm_percent >= 5.0 else "Standard OGTT at 24-28 weeks"
        }

    @staticmethod
    def preterm_birth_risk(
        cervical_length_mm: Optional[float] = 35.0,
        prev_preterm_34: bool = False,
        prev_preterm_37: bool = False,
        cervical_surgery: bool = False
    ) -> Dict[str, Any]:
        """FMF Screening for Spontaneous Preterm Birth by Cervical Length & Obstetric History."""
        cl = cervical_length_mm if cervical_length_mm is not None else 35.0
        
        # History logit shift
        logit_34 = -3.8
        if prev_preterm_34: logit_34 += 2.2
        elif prev_preterm_37: logit_34 += 1.2
        if cervical_surgery: logit_34 += 0.8
        
        # Cervical length effect (reference 36mm)
        if cl < 36:
            logit_34 += (36.0 - cl) * 0.18

        prob_34 = 1.0 / (1.0 + math.exp(-logit_34))
        prob_37 = min(0.95, prob_34 * 2.5)

        return {
            "preterm_34_ratio": f"1 in {int(round(1.0 / max(prob_34, 1e-6)))}",
            "preterm_37_ratio": f"1 in {int(round(1.0 / max(prob_37, 1e-6)))}",
            "is_high_risk": cl <= 25.0 or prev_preterm_34,
            "recommendation": "Vaginal Progesterone (200mg/day) or Cervical Cerclage recommended" if (cl <= 25.0 or prev_preterm_34) else "Routine cervical surveillance"
        }
