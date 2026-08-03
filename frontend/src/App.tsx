import { useState, useCallback, useMemo, useEffect } from 'react'
import axios from 'axios'
import {
  Activity, FileText, ChevronDown, ChevronUp,
  Stethoscope, Heart, User, Calendar, Printer, ShieldAlert, Dna, Baby, RefreshCw, TrendingUp
} from 'lucide-react'
import NavBar from './components/NavBar'
import HomePage from './pages/HomePage'
import HistoryPage from './pages/HistoryPage'

const API = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:8000'

type Page = 'home' | 'scan' | 'history'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function centileClass(p?: number) {
  if (p === undefined || p === null) return ''
  if (p < 10) return 'centile-badge centile-low'
  if (p > 90) return 'centile-badge centile-high'
  return 'centile-badge centile-normal'
}

function centileLabel(p?: number) {
  if (p === undefined || p === null) return ''
  return `${p.toFixed(1)}%`
}

function efwClass(cat?: string) {
  if (cat === 'SGA') return 'status-sga font-bold'
  if (cat === 'LGA') return 'status-lga font-bold'
  return 'status-aga font-bold'
}

function getExpectedMeans(gaWeeks: number) {
  if (!gaWeeks || gaWeeks < 12) return { bpd: '54.9', hc: '203.8', ac: '181.1', fl: '40.5', hl: '35.5', crl: '55.0' }
  const bpd = Math.max(0, -32.81 + 4.714 * gaWeeks - 0.03671 * gaWeeks * gaWeeks).toFixed(1)
  const ga = Math.min(gaWeeks, 39.776)
  const hcLog = 1.3369692 + 0.0596493 * ga - 0.0007494 * ga * ga
  const hc = Math.max(0, Math.pow(10, hcLog) - 1).toFixed(1)
  const acLog = 1.3257977 + 0.0552337 * gaWeeks - 0.0006146021 * gaWeeks * gaWeeks
  const ac = Math.max(0, Math.pow(10, acLog) - 9).toFixed(1)
  const flSqrt = 0.4263429 * gaWeeks - 1.1132444 - 0.0045992 * gaWeeks * gaWeeks
  const fl = Math.max(0, Math.pow(flSqrt, 2)).toFixed(1)
  const hl = (parseFloat(fl) * 0.87).toFixed(1)
  return { bpd, hc, ac, fl, hl, crl: 'if <14w' }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface BiometryResult {
  hc_z?: number; hc_p?: number
  ac_z?: number; ac_p?: number
  fl_z?: number; fl_p?: number
  bpd_z?: number; bpd_p?: number
  efw_grams?: number; efw_z?: number; efw_p?: number; efw_category?: string
}

interface DopplerResult {
  mca_psv_expected?: number; mca_psv_mom?: number; mca_anemia_category?: string
  uta_pi_mean?: number
}

// ─── Extended FMF / ISUOG Level-II Anatomy Protocol ───────────────────────────
const DEFAULT_ANATOMY_ITEMS: Record<string, string[]> = {
  'Head': [
    'Falx seen', 'Skull Bones normal', 'Cavum Septum Pellucidum normal', 
    'Corpus Callosum seen', 'Choroid Plexus normal', 'Cerebellum/Vermis seen',
    'Anterior & Posterior Horns normal', 'Thalamus & Third Ventricle normal', 'Sylvian Fissure seen'
  ],
  'Face & Neck': [
    'Orbits normal', 'Nose normal', 'Jaw normal', 
    'Lips & Lip Line intact', 'Nasal Bone seen', 'Profile normal',
    'Hard & Soft Palate intact', 'Lenses (Both Eyes) seen', 'Neck (No Hygroma) normal'
  ],
  'Thorax & Lungs': [
    'Right lung normal', 'Left lung normal', 'Diaphragm normal',
    'Thymus seen', 'No Pleural Effusion / Mass normal', 'Thoracic Symmetry normal'
  ],
  'Heart & Circulation': [
    'FHM seen', 'Position leftside', 'Axis normal', 
    '4 Chambers normal', 'Intraventricular Septum normal', 'Foramen Ovale seen',
    'Mitral & Tricuspid Valves normal', 'Three-Vessel View (3VV) normal', 
    'Three-Vessel Trachea View (3VT) normal', 'Pulmonary Veins to LA seen', 'Regurgitation no'
  ],
  'Great Vessels & Outflow': [
    'LVOT normal', 'RVOT normal', 'Aortic Arch normal', 'Ductal Arch normal',
    'Superior Vena Cava (SVC) normal', 'Inferior Vena Cava (IVC) normal'
  ],
  'Abdomen & Pelvis': [
    'Stomach/Situs normal', 'Kidney (Left) seen', 'Kidney (Right) seen', 
    'Bladder seen', 'Abdominal Wall normal', 'Bowel echogenicity normal',
    'Gallbladder seen', 'Adrenal Glands normal', 'No Ascites / Mass normal'
  ],
  'Spine & Skeleton': [
    'Ossification Centres seen', 'Skin Line intact', 'Cervical & Thoracic Spine normal',
    'Lumbar & Sacral Spine normal', 'Vertebral Alignment normal'
  ],
  'Extremities': [
    '12 Long Bones seen', 'Both Hands & Thumbs seen', 'Both Feet & Ankles seen',
    'Pelvic Bones & Clavicles normal'
  ],
  'Umbilical Cord & Placenta': [
    'Cord Insertion normal', '3 Vessel Cord seen', 'Ductus Venosus flow normal',
    'Amniotic Fluid echogenicity clear'
  ]
}

// ─── Component: Input Field ───────────────────────────────────────────────────
function Field({ label, value, onChange, type='text', placeholder='', unit='' }: any) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          className="fmf-input"
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1 }}
        />
        {unit && <span style={{ fontSize: 11, color: '#64748b', minWidth: 24 }}>{unit}</span>}
      </div>
    </div>
  )
}

// ─── Component: Section ──────────────────────────────────────────────────────
function Section({ title, children, icon: Icon, rightElement }: any) {
  const [open, setOpen] = useState(true)
  return (
    <div className="glass-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: open ? '1px solid rgba(51,65,85,0.6)' : 'none' }}>
        <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
          {Icon && <Icon size={14} style={{ color: '#0ea5e9' }} />}
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0ea5e9' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {rightElement}
          <div onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', display: 'flex' }}>
            {open ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
          </div>
        </div>
      </div>
      {open && <div style={{ padding: '14px 16px' }}>{children}</div>}
    </div>
  )
}

// ─── Component: Biometry Row ──────────────────────────────────────────────────
function BiometryRow({ label, value, onChange, z, p, onBlur, meanVal }: any) {
  const cls = centileClass(p)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{label}</span>
        {meanVal && <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600 }}>Mean: {meanVal} mm</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, alignItems: 'center' }}>
        <input
          className="fmf-input"
          type="number"
          step="0.1"
          value={value}
          placeholder={meanVal ? `${meanVal}` : 'mm'}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          style={{ padding: '7px 10px', fontSize: 13, background: value ? 'rgba(15, 23, 42, 0.9)' : 'rgba(30, 41, 59, 0.5)' }}
        />
        <div style={{ textAlign: 'right' }}>
          {p != null && <span className={cls} style={{ fontSize: 11 }}>{centileLabel(p)}</span>}
          {z != null && <span style={{ display: 'block', fontSize: 10, color: '#64748b', marginTop: 2 }}>Z: {z.toFixed(2)}</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [tab, setTab] = useState<'scan' | 'doppler' | 'risk'>('scan')
  const [riskSubTab, setRiskSubTab] = useState<'pe' | 'trisomy' | 'sga' | 'gdm' | 'preterm' | 'soft_markers'>('pe')
  void setTab // consumed by scan-tab nav below

  // Patient details
  const [patient, setPatient] = useState({
    name: 'SAYTI BOSH', id: '124523-C3AA', refDoc: 'DR MAHESH SHETA',
    examDate: '16/07/2026', lmp: '08/02/2026', eddLmp: '15/11/2026',
    gaWeeks: 22, gaDays: 4,
    gaWeeksScan: 22, gaDaysScan: 6, eddScan: '13/11/2026',
    fhrBpm: 156
  })

  // Fetal details
  const [fetalDetails, setFetalDetails] = useState({
    number: 'SINGLE', cardiac: 'SEEN', presentation: 'CEPHALIC',
    placenta: 'POST WALL', liquor: 'NORMAL', afi: ''
  })

  // Extra placenta / cervix fields
  const [placentaExt, setPlacentaExt] = useState({
    dist: '1.88', myometrial: 'yes', cervixLength: '2.84', cervixClosed: true
  })

  // Biometry initialized with mean values by default
  const [bm, setBm] = useState({ bpd: '54.9', hc: '203.8', ac: '181.1', fl: '40.5', hl: '35.5', crl: '' })
  const [bio, setBio] = useState<BiometryResult>({})

  // Dopplers (including UmA PI, MCA PI, CPR, and Ductus Venosus)
  const [dop, setDop] = useState({ utaLeft: '1.00', utaRight: '0.87', mcaPsv: '35.0', umaPi: '1.02', mcaPi: '1.85', dvPiv: '0.52', dvWave: 'Normal (Positive A-wave)' })
  const [dopResult, setDopResult] = useState<DopplerResult>({})

  // Anatomy state
  const [anatomy, setAnatomy] = useState<Record<string, string>>({})
  const [anatomyChecked, setAnatomyChecked] = useState<Record<string, boolean>>({})
  const [anatomyItems, setAnatomyItems] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('fmf_master_anatomy_structures_v1')
      if (saved) return JSON.parse(saved)
      return DEFAULT_ANATOMY_ITEMS
    } catch {
      return DEFAULT_ANATOMY_ITEMS
    }
  })
  const [newAnatomyInput, setNewAnatomyInput] = useState<Record<string, string>>({})
  const [customMeasures, setCustomMeasures] = useState({ lv: '5.6', nt: '4.5', cm: '5.2' })
  const [newAnatomySection, setNewAnatomySection] = useState<string>('Thorax & Lungs')
  const [newAnatomyStructureName, setNewAnatomyStructureName] = useState<string>('')

  const addAnatomyStructure = () => {
    const sec = newAnatomySection.trim() || 'General Anatomy'
    const name = newAnatomyStructureName.trim()
    if (!name) return
    setAnatomyItems(prev => {
      const currentList = prev[sec] || []
      if (currentList.includes(name)) return prev
      const updated = { ...prev, [sec]: [...currentList, name] }
      try { localStorage.setItem('fmf_master_anatomy_structures_v1', JSON.stringify(updated)) } catch {}
      return updated
    })
    setNewAnatomyStructureName('')
  }

  const removeAnatomyStructure = (section: string, item: string) => {
    setAnatomyItems(prev => {
      const list = (prev[section] || []).filter(i => i !== item)
      const updated = { ...prev }
      if (list.length === 0) {
        delete updated[section]
      } else {
        updated[section] = list
      }
      try { localStorage.setItem('fmf_master_anatomy_structures_v1', JSON.stringify(updated)) } catch {}
      return updated
    })
    const itemKey = `${section}:${item}`
    setCustomAnatomyOptions(prev => {
      const copy = { ...prev }
      delete copy[itemKey]
      try { localStorage.setItem('fmf_custom_anatomy_options_per_item', JSON.stringify(copy)) } catch {}
      return copy
    })
  }

  // Persistent Custom Dropdown Values PER ANATOMICAL STRUCTURE (saved in localStorage so previous additions remain available forever)
  const [customAnatomyOptions, setCustomAnatomyOptions] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('fmf_custom_anatomy_options_per_item')
      if (saved) return JSON.parse(saved)
      // Check if old format existed and convert or initialize with clinical examples
      return {
        'Thorax & Lungs:Right lung normal': ['CPAM in lower zone', 'Mild echogenicity seen'],
        'Abdomen & Pelvis:Kidney (Left) seen': ['4mm cyst visible', 'Prominent renal pelvis'],
        'Head & Brain:Falx seen': ['Normal (square shape variant)'],
      }
    } catch {
      return {}
    }
  })
  const [addingOptionKey, setAddingOptionKey] = useState<string | null>(null)
  const [newOptionValue, setNewOptionValue] = useState<string>('')
  const [showManageOptions, setShowManageOptions] = useState(false)

  const saveNewAnatomyOption = (key: string) => {
    const val = newOptionValue.trim()
    if (!val) {
      setAddingOptionKey(null)
      return
    }
    setCustomAnatomyOptions(prev => {
      const currentList = prev[key] || []
      if (currentList.includes(val)) return prev
      const nextObj = { ...prev, [key]: [...currentList, val] }
      try { localStorage.setItem('fmf_custom_anatomy_options_per_item', JSON.stringify(nextObj)) } catch {}
      return nextObj
    })
    setAnatomy(a => ({ ...a, [key]: val }))
    setAddingOptionKey(null)
    setNewOptionValue('')
    axios.post(`${API}/db/custom_findings`, { category: 'anatomy', marker_key: key, option_text: val }).catch(() => {})
  }

  const deleteCustomAnatomyOption = (key: string, optToDelete: string) => {
    setCustomAnatomyOptions(prev => {
      const currentList = prev[key] || []
      const nextList = currentList.filter(o => o !== optToDelete)
      const nextObj = { ...prev }
      if (nextList.length === 0) {
        delete nextObj[key]
      } else {
        nextObj[key] = nextList
      }
      try { localStorage.setItem('fmf_custom_anatomy_options_per_item', JSON.stringify(nextObj)) } catch {}
      return nextObj
    })
    setAnatomy(prev => {
      if (prev[key] === optToDelete) {
        return { ...prev, [key]: 'normal' }
      }
      return prev
    })
    axios.delete(`${API}/db/custom_findings`, { data: { category: 'anatomy', marker_key: key, option_text: optToDelete } }).catch(() => {})
  }

  const totalCustomOptionsCount = Object.values(customAnatomyOptions).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0)

  const addCustomAnatomyItem = (section: string) => {
    const val = (newAnatomyInput[section] || '').trim()
    if (!val) return
    setAnatomyItems(a => {
      const existing = a[section] || []
      if (existing.includes(val)) return a
      return { ...a, [section]: [...existing, val] }
    })
    setNewAnatomyInput(n => ({ ...n, [section]: '' }))
  }
  const [summary, setSummary] = useState('')

  // ─── RISK CALCULATOR STATES ───────────────────────────────────────────────
  const [riskFactors, setRiskFactors] = useState({
    age: 32, bmi: 25.4, ethnicity: 'Caucasian',
    chronicHtn: false, prevPe: false, diabetes: false, nulliparous: true,
    mapMmHg: 92, utaPiMom: 1.1, plgfMom: 0.85, pappaMom: 0.90,
    ntMm: 1.6, crlMm: 62.0, freeHcgMom: 1.15,
    smoking: false, prevSga: false,
    familyDiabetes: false, prevGdm: false, prevMacrosomia: false,
    clMm: 34.0, prevPreterm34: false, prevPreterm37: false,
    familyHxPe: false, sleAps: false, nasalBone: 'Normal', trRegurgitation: false, dvReversed: false, cervicalSurgery: false
  })

  const [riskResults, setRiskResults] = useState<Record<string, any>>({})
  const [riskChecked, setRiskChecked] = useState<Record<string, boolean>>({
    pe: true, trisomy: true, sga: true, gdm: true, preterm: true, soft_markers: true
  })
  const [selectedGraphs, setSelectedGraphs] = useState<Record<string, boolean>>({
    bpd: true, hc: true, ac: true, fl: true, efw: true, uta_pi: true, uma_pi: true, mca_pi: true, cpr: true, dv_piv: true, nt: true
  })

  // Persistent Custom Soft Markers (Saved per clinical item in localStorage)
  const [softMarkers, setSoftMarkers] = useState<Record<string, string>>({
    'Nasal Bone (NB)': 'Normal / Present',
    'Nuchal Fold (NF)': 'Normal (< 6mm)',
    'Echogenic Intracardiac Focus': 'Absent',
    'Renal Pyelectasis': 'Normal (< 4mm)',
    'Choroid Plexus Cyst': 'Absent',
    'Echogenic Bowel': 'Normal',
    'Short Femur / Humerus': 'Normal length',
    'Single Umbilical Artery': 'Three vessels present',
    'Aberrant Right Subclavian Artery (ARSA)': 'Normal layout',
    'Ventriculomegaly / Clinodactyly': 'Normal / Absent'
  })
  const [softMarkerCustom, setSoftMarkerCustom] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('fmf_soft_marker_custom_options')
      if (saved) return JSON.parse(saved)
      return {
        'Nasal Bone (NB)': ['Hypoplastic (< 2.5mm)', 'Absent nasal bone'],
        'Echogenic Intracardiac Focus': ['Bilateral focus present', 'Left ventricle echogenic focus'],
        'Renal Pyelectasis': ['Mild pyelectasis (4-7mm)', 'Moderate dilation seen']
      }
    } catch {
      return {}
    }
  })
  const [addingSoftMarkerKey, setAddingSoftMarkerKey] = useState<string | null>(null)
  const [newSoftMarkerValue, setNewSoftMarkerValue] = useState<string>('')

  const saveNewSoftMarkerOption = (key: string) => {
    const val = newSoftMarkerValue.trim()
    if (!val) return
    const updated = { ...softMarkerCustom, [key]: [...(softMarkerCustom[key] || []), val] }
    setSoftMarkerCustom(updated)
    setSoftMarkers(m => ({ ...m, [key]: val }))
    try { localStorage.setItem('fmf_soft_marker_custom_options', JSON.stringify(updated)) } catch {}
    setAddingSoftMarkerKey(null)
    setNewSoftMarkerValue('')
    axios.post(`${API}/db/custom_findings`, { category: 'soft_marker', marker_key: key, option_text: val }).catch(() => {})
  }

  const deleteSoftMarkerOption = (key: string, optionToDelete: string) => {
    const updatedOptions = (softMarkerCustom[key] || []).filter(opt => opt !== optionToDelete)
    const updated = { ...softMarkerCustom, [key]: updatedOptions }
    setSoftMarkerCustom(updated)
    try { localStorage.setItem('fmf_soft_marker_custom_options', JSON.stringify(updated)) } catch {}
    axios.delete(`${API}/db/custom_findings`, { data: { category: 'soft_marker', marker_key: key, option_text: optionToDelete } }).catch(() => {})
  }

  // Universal Cloud Sync: Fetch shared custom findings from Supabase Postgres on startup!
  useEffect(() => {
    axios.get(`${API}/db/custom_findings/anatomy`).then(res => {
      const dbAnatomy = res.data?.options || {}
      if (Object.keys(dbAnatomy).length > 0) {
        setCustomAnatomyOptions(prev => {
          const merged = { ...prev }
          Object.keys(dbAnatomy).forEach(k => {
            merged[k] = Array.from(new Set([...(merged[k] || []), ...dbAnatomy[k]]))
          })
          try { localStorage.setItem('fmf_custom_anatomy_options_per_item', JSON.stringify(merged)) } catch {}
          return merged
        })
      }
    }).catch(() => {})

    axios.get(`${API}/db/custom_findings/soft_marker`).then(res => {
      const dbMarkers = res.data?.options || {}
      if (Object.keys(dbMarkers).length > 0) {
        setSoftMarkerCustom(prev => {
          const merged = { ...prev }
          Object.keys(dbMarkers).forEach(k => {
            merged[k] = Array.from(new Set([...(merged[k] || []), ...dbMarkers[k]]))
          })
          try { localStorage.setItem('fmf_soft_marker_custom_options', JSON.stringify(merged)) } catch {}
          return merged
        })
      }
    }).catch(() => {})
  }, [])

  const gaDays = patient.gaWeeksScan * 7 + patient.gaDaysScan
  const gaWeeks = patient.gaWeeksScan + patient.gaDaysScan / 7
  const expectedMeans = useMemo(() => getExpectedMeans(gaWeeks), [gaWeeks])

  const calculate = useCallback(async () => {
    if (!gaDays) return
    try {
      const res = await axios.post(`${API}/calculate/biometry`, {
        ga_days: gaDays,
        hc_mm: bm.hc ? +bm.hc : undefined,
        ac_mm: bm.ac ? +bm.ac : undefined,
        fl_mm: bm.fl ? +bm.fl : undefined,
        bpd_mm: bm.bpd ? +bm.bpd : undefined,
      })
      setBio(res.data)
    } catch {}
  }, [gaDays, bm])

  // Run calculation on load or when biometry changes
  useEffect(() => {
    calculate()
  }, [calculate])

  // Populate form with 50th centile mean values
  const setBiometryToMeans = () => {
    setBm({
      bpd: expectedMeans.bpd,
      hc: expectedMeans.hc,
      ac: expectedMeans.ac,
      fl: expectedMeans.fl,
      hl: expectedMeans.hl,
      crl: ''
    })
  }

  const calcDoppler = useCallback(async () => {
    try {
      const res = await axios.post(`${API}/calculate/doppler`, {
        ga_weeks: gaWeeks,
        uta_pi_left: dop.utaLeft ? +dop.utaLeft : undefined,
        uta_pi_right: dop.utaRight ? +dop.utaRight : undefined,
        mca_psv: dop.mcaPsv ? +dop.mcaPsv : undefined,
      })
      setDopResult(res.data)
    } catch {}
  }, [gaWeeks, dop])

  // Recalculate All 5 Risk Engines Simultaneously so complete results are ready for PDF report export!
  const calculateRisk = useCallback(async () => {
    try {
      const pPe = axios.post(`${API}/calculate/risk/preeclampsia`, {
        age: riskFactors.age, bmi: riskFactors.bmi, ethnicity: riskFactors.ethnicity,
        chronic_htn: riskFactors.chronicHtn, prev_pe: riskFactors.prevPe,
        diabetes: riskFactors.diabetes, nulliparous: riskFactors.nulliparous,
        smoking: riskFactors.smoking, family_hx_pe: riskFactors.familyHxPe, sle_aps: riskFactors.sleAps,
        map_mmHg: riskFactors.mapMmHg, uta_pi_mom: riskFactors.utaPiMom,
        plgf_mom: riskFactors.plgfMom, pappa_mom: riskFactors.pappaMom
      }).catch(() => null)

      const pTrisomy = axios.post(`${API}/calculate/risk/trisomies`, {
        maternal_age: riskFactors.age, ga_weeks: gaWeeks,
        crl_mm: riskFactors.crlMm, nt_mm: riskFactors.ntMm, fhr_bpm: patient.fhrBpm,
        free_hcg_mom: riskFactors.freeHcgMom, pappa_mom: riskFactors.pappaMom,
        nasal_bone: riskFactors.nasalBone, tr_regurgitation: riskFactors.trRegurgitation, dv_reversed: riskFactors.dvReversed
      }).catch(() => null)

      const pSga = axios.post(`${API}/calculate/risk/sga`, {
        maternal_age: riskFactors.age, bmi: riskFactors.bmi, ethnicity: riskFactors.ethnicity,
        smoking: riskFactors.smoking, nulliparous: riskFactors.nulliparous, prev_sga: riskFactors.prevSga,
        chronic_htn: riskFactors.chronicHtn, efw_centile: bio.efw_p || 50.0, uta_pi_mom: riskFactors.utaPiMom, plgf_mom: riskFactors.plgfMom
      }).catch(() => null)

      const pGdm = axios.post(`${API}/calculate/risk/gdm`, {
        maternal_age: riskFactors.age, bmi: riskFactors.bmi, ethnicity: riskFactors.ethnicity,
        family_hx_diabetes: riskFactors.familyDiabetes, prev_gdm: riskFactors.prevGdm,
        prev_macrosomia: riskFactors.prevMacrosomia
      }).catch(() => null)

      const pPreterm = axios.post(`${API}/calculate/risk/preterm`, {
        cervical_length_mm: riskFactors.clMm,
        prev_preterm_34: riskFactors.prevPreterm34,
        prev_preterm_37: riskFactors.prevPreterm37,
        cervical_surgery: riskFactors.cervicalSurgery
      }).catch(() => null)

      const [resPe, resTri, resSga, resGdm, resPre] = await Promise.all([pPe, pTrisomy, pSga, pGdm, pPreterm])

      setRiskResults(prev => ({
        ...prev,
        ...(resPe?.data ? { pe: { ...resPe.data, title: 'Preeclampsia (Early / Preterm / Term)' } } : {}),
        ...(resTri?.data ? { trisomy: { ...resTri.data, title: 'Trisomy 21, 18 & 13 Likelihood' } } : {}),
        ...(resSga?.data ? { sga: { ...resSga.data, title: 'Small for Gestational Age (SGA / FGR)' } } : {}),
        ...(resGdm?.data ? { gdm: { ...resGdm.data, title: 'Gestational Diabetes Mellitus (GDM)' } } : {}),
        ...(resPre?.data ? { preterm: { ...resPre.data, title: 'Spontaneous Preterm Birth (<34w / <37w)' } } : {}),
      }))
    } catch {}
  }, [riskFactors, gaWeeks, patient.fhrBpm, bio.efw_p])

  useEffect(() => {
    if (tab === 'risk') calculateRisk()
  }, [tab, riskSubTab, calculateRisk])

  const toggleSectionCheck = (section: string, items: string[], currentChecked: boolean) => {
    const nextState = { ...anatomyChecked }
    items.forEach(item => { nextState[`${section}:${item}`] = !currentChecked })
    setAnatomyChecked(nextState)
  }

  const generatePdf = async () => {
    const biometryRows = [
      { param: 'BPD', meas: bm.bpd ? `${bm.bpd} MM` : (expectedMeans.bpd ? `${expectedMeans.bpd} MM (Mean)` : ''), perc: bio.bpd_p != null ? `${bio.bpd_p.toFixed(1)}%` : '50.0%' },
      { param: 'HC',  meas: bm.hc  ? `${bm.hc} MM`  : (expectedMeans.hc  ? `${expectedMeans.hc} MM (Mean)`  : ''), perc: bio.hc_p  != null ? `${bio.hc_p.toFixed(1)}%`  : '50.0%' },
      { param: 'AC',  meas: bm.ac  ? `${bm.ac} MM`  : (expectedMeans.ac  ? `${expectedMeans.ac} MM (Mean)`  : ''), perc: bio.ac_p  != null ? `${bio.ac_p.toFixed(1)}%`  : '50.0%' },
      { param: 'FL',  meas: bm.fl  ? `${bm.fl} MM`  : (expectedMeans.fl  ? `${expectedMeans.fl} MM (Mean)`  : ''), perc: bio.fl_p  != null ? `${bio.fl_p.toFixed(1)}%`  : '50.0%' },
      { param: 'HL',  meas: bm.hl  ? `${bm.hl} MM`  : (expectedMeans.hl  ? `${expectedMeans.hl} MM (Mean)`  : ''), perc: '' },
      { param: 'EFW', meas: bio.efw_grams ? `${Math.round(bio.efw_grams)} g` : '', perc: bio.efw_p != null ? `${bio.efw_p.toFixed(1)}%` : '' },
      { param: 'CRL (if <14w)', meas: bm.crl ? `${bm.crl} MM` : '', perc: '' },
    ].filter(r => r.meas)

    const anatObj: Record<string, string> = {}
    Object.entries(anatomyItems).forEach(([section, items]) => {
      items.forEach(item => {
        const key = `${section}:${item}`
        if (anatomyChecked[key] !== false) {
          anatObj[item.trim()] = anatomy[key] || 'normal'
        }
      })
    })

    let utaMean = dopResult.uta_pi_mean?.toFixed(3)
    if (!utaMean && dop.utaLeft && dop.utaRight) {
      utaMean = ((+dop.utaLeft + +dop.utaRight) / 2).toFixed(3)
    }

    const activeRisks: Record<string, any> = {}
    Object.entries(riskResults).forEach(([key, resData]) => {
      if (riskChecked[key] !== false) {
        activeRisks[key] = resData
      }
    })

    try {
      const res = await axios.post(`${API}/report/pdf`, {
        patient_name: patient.name, patient_id: patient.id,
        ga_days: patient.gaWeeksScan * 7 + patient.gaDaysScan,
        risk_assessment: activeRisks,
        selected_graphs: selectedGraphs,
        referring_doctor: patient.refDoc, exam_date: patient.examDate,
        ga_lmp: `${patient.gaWeeks} weeks ${patient.gaDays} days`,
        edd_lmp: patient.eddLmp,
        ga_scan: `${patient.gaWeeksScan} weeks ${patient.gaDaysScan} days`,
        edd_scan: patient.eddScan,
        fetal_number: fetalDetails.number,
        cardiac_activity: fetalDetails.cardiac,
        presentation: fetalDetails.presentation,
        placenta: fetalDetails.placenta,
        liquor: fetalDetails.liquor,
        afi: fetalDetails.afi,
        biometry: biometryRows,
        anatomy: anatObj,
        anatomy_comments: {},
        anatomy_sections: anatomyItems,
        custom_measures: {
          lv: customMeasures.lv, nt: customMeasures.nt, cm: customMeasures.cm, fhr: String(patient.fhrBpm),
        },
        placenta_dist: placentaExt.dist,
        myometrial_interface: placentaExt.myometrial,
        cervix_length: placentaExt.cervixLength,
        cervix_closed: placentaExt.cervixClosed,
        doppler: { lt: dop.utaLeft, rt: dop.utaRight, mean: utaMean, uma_pi: dop.umaPi, mca_pi: dop.mcaPi, cpr: (dop.mcaPi && dop.umaPi && +dop.umaPi !== 0 ? (+dop.mcaPi / +dop.umaPi).toFixed(2) : '—'), dv_piv: dop.dvPiv, dv_waveform: dop.dvWave },
        soft_markers: riskChecked['soft_markers'] !== false ? softMarkers : {},
        soft_marker_custom: softMarkerCustom,
        summary, doctor_name: patient.refDoc, reg_no: 'G-10577', fmf_id: '131606'
      }, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = `report_${patient.id}.pdf`; a.click()
    } catch {
      alert('Could not generate PDF. Make sure the backend server is running at http://localhost:8000')
    }
  }

  if (currentPage === 'home') return (
    <>
      <NavBar currentPage={currentPage} onNavigate={setCurrentPage} />
      <HomePage onNavigate={setCurrentPage} />
    </>
  )

  if (currentPage === 'history') return (
    <>
      <NavBar currentPage={currentPage} onNavigate={setCurrentPage} />
      <HistoryPage />
    </>
  )

  // currentPage === 'scan'
  return (
    <>
      <NavBar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div style={{ minHeight: 'calc(100vh - 56px)', background: 'linear-gradient(135deg, #0a0f1e 0%, #0f172a 50%, #0a0f1e 100%)' }}>


      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '340px 1fr 280px', gap: 16 }}>

        {/* LEFT COLUMN — Patient + Fetal Details */}
        <div>
          <Section title="Patient Details" icon={User}>
            <Field label="Patient Name" value={patient.name} onChange={(v:string) => setPatient(p => ({...p, name: v}))} />
            <Field label="Patient ID" value={patient.id} onChange={(v:string) => setPatient(p => ({...p, id: v}))} />
            <Field label="Referring Doctor" value={patient.refDoc} onChange={(v:string) => setPatient(p => ({...p, refDoc: v}))} />
            <Field label="Exam Date" value={patient.examDate} onChange={(v:string) => setPatient(p => ({...p, examDate: v}))} />
          </Section>

          <Section title="Gestational Age" icon={Calendar}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>GA LMP (Weeks)</label>
                <input className="fmf-input" type="number" value={patient.gaWeeks} onChange={e=>setPatient(p=>({...p, gaWeeks:+e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Days</label>
                <input className="fmf-input" type="number" value={patient.gaDays} onChange={e=>setPatient(p=>({...p, gaDays:+e.target.value}))} />
              </div>
            </div>
            <Field label="LMP Date" value={patient.lmp} onChange={(v:string) => setPatient(p=>({...p, lmp:v}))} />
            <Field label="EDD by LMP" value={patient.eddLmp} onChange={(v:string) => setPatient(p=>({...p, eddLmp:v}))} />
            <div style={{ borderTop: '1px solid rgba(51,65,85,0.5)', paddingTop: 10, marginTop: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#0ea5e9', display: 'block', marginBottom: 4 }}>GA Scan (Weeks)</label>
                  <input className="fmf-input" type="number" value={patient.gaWeeksScan} onChange={e=>setPatient(p=>({...p, gaWeeksScan:+e.target.value}))} style={{ borderColor: 'rgba(14,165,233,0.4)' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#0ea5e9', display: 'block', marginBottom: 4 }}>Days</label>
                  <input className="fmf-input" type="number" value={patient.gaDaysScan} onChange={e=>setPatient(p=>({...p, gaDaysScan:+e.target.value}))} style={{ borderColor: 'rgba(14,165,233,0.4)' }} />
                </div>
              </div>
              <Field label="EDD by Scan" value={patient.eddScan} onChange={(v:string) => setPatient(p=>({...p, eddScan:v}))} />
            </div>
          </Section>

          <Section title="Fetal Details" icon={Heart}>
            {[
              { label: 'Fetal Number', key: 'number', opts: ['SINGLE', 'TWIN A', 'TWIN B', 'TRIPLET A'] },
              { label: 'Cardiac Activity', key: 'cardiac', opts: ['SEEN', 'NOT SEEN', 'IRREGULAR'] },
              { label: 'Presentation', key: 'presentation', opts: ['CEPHALIC', 'BREECH', 'TRANSVERSE', 'OBLIQUE'] },
              { label: 'Placenta', key: 'placenta', opts: ['POST WALL', 'ANTERIOR WALL', 'FUNDAL', 'LEFT LATERAL', 'RIGHT LATERAL', 'LOW LYING', 'PREVIA'] },
              { label: 'Liquor (AFI)', key: 'liquor', opts: ['NORMAL', 'REDUCED', 'INCREASED', 'ABSENT'] },
            ].map(({ label, key, opts }) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
                <select className="fmf-select" value={(fetalDetails as any)[key]} onChange={e => setFetalDetails(d => ({...d, [key]: e.target.value}))}>
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>AFI / FHR (bpm)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="fmf-input" placeholder="AFI (e.g. 14.2 cm)" value={fetalDetails.afi} onChange={e=>setFetalDetails(d=>({...d, afi:e.target.value}))} />
                <input className="fmf-input" type="number" placeholder="FHR (e.g. 156)" value={patient.fhrBpm} onChange={e=>setPatient(p=>({...p, fhrBpm:+e.target.value}))} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(51,65,85,0.5)', paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Placenta & Cervix</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label className="field-label">Dist. from Int. Os</label>
                  <input className="fmf-input" type="number" step="0.01" placeholder="e.g. 1.88 cm" value={placentaExt.dist} onChange={e=>setPlacentaExt(p=>({...p,dist:e.target.value}))} />
                </div>
                <div>
                  <label className="field-label">Myometrial Interface</label>
                  <select className="fmf-select" value={placentaExt.myometrial} onChange={e=>setPlacentaExt(p=>({...p,myometrial:e.target.value}))}>
                    <option value="yes">Yes — Defined</option>
                    <option value="no">No — Indistinct</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="field-label">Cervical Length</label>
                  <input className="fmf-input" type="number" step="0.01" placeholder="e.g. 2.84 cm" value={placentaExt.cervixLength} onChange={e=>setPlacentaExt(p=>({...p,cervixLength:e.target.value}))} />
                </div>
                <div>
                  <label className="field-label">Cervix Status</label>
                  <select className="fmf-select" value={placentaExt.cervixClosed ? 'closed' : 'open'} onChange={e=>setPlacentaExt(p=>({...p,cervixClosed:e.target.value==='closed'}))}>
                    <option value="closed">Closed ☑</option>
                    <option value="open">Open ⚠</option>
                  </select>
                </div>
              </div>
            </div>
          </Section>
        </div>

        {/* MIDDLE COLUMN — Biometry / Anatomy / Dopplers / Risk Engines */}
        <div>
          {tab === 'scan' && <>
            <Section title="2. Fetal Biometry (FMF 50th Centile Defaults)" icon={Activity} rightElement={
              <button 
                type="button" 
                onClick={setBiometryToMeans}
                style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <RefreshCw size={11} /> Fill Means
              </button>
            }>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12, background: 'rgba(14, 165, 233, 0.1)', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(14, 165, 233, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>ℹ️ Inputs default to expected 50th centile for <b>{patient.gaWeeksScan}w {patient.gaDaysScan}d</b>.</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                <BiometryRow label="BPD" value={bm.bpd} onChange={(v:string)=>setBm(b=>({...b,bpd:v}))} z={bio.bpd_z} p={bio.bpd_p} onBlur={calculate} meanVal={expectedMeans.bpd} />
                <BiometryRow label="HC" value={bm.hc} onChange={(v:string)=>setBm(b=>({...b,hc:v}))} z={bio.hc_z} p={bio.hc_p} onBlur={calculate} meanVal={expectedMeans.hc} />
                <BiometryRow label="AC" value={bm.ac} onChange={(v:string)=>setBm(b=>({...b,ac:v}))} z={bio.ac_z} p={bio.ac_p} onBlur={calculate} meanVal={expectedMeans.ac} />
                <BiometryRow label="FL" value={bm.fl} onChange={(v:string)=>setBm(b=>({...b,fl:v}))} z={bio.fl_z} p={bio.fl_p} onBlur={calculate} meanVal={expectedMeans.fl} />
                <BiometryRow label="HL" value={bm.hl} onChange={(v:string)=>setBm(b=>({...b,hl:v}))} onBlur={()=>{}} meanVal={expectedMeans.hl} />
                <BiometryRow label="CRL" value={bm.crl} onChange={(v:string)=>setBm(b=>({...b,crl:v}))} onBlur={()=>{}} meanVal={expectedMeans.crl} />
              </div>
            </Section>

            {/* Anatomy Sections */}
            <div style={{ margin: '14px 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>
                Anatomy Evaluation Protocol <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>— Custom findings saved via "+ Value" remain persistent & strictly isolated to that specific anatomical structure!</span>
              </div>
              <button
                type="button"
                onClick={() => setShowManageOptions(s => !s)}
                style={{
                  background: showManageOptions ? 'rgba(14, 165, 233, 0.25)' : 'rgba(100, 116, 139, 0.2)',
                  border: `1px solid ${showManageOptions ? '#38bdf8' : 'rgba(100, 116, 139, 0.4)'}`,
                  color: '#cbd5e1', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500
                }}
              >
                ⚙️ Manage Saved Options ({totalCustomOptionsCount}) {showManageOptions ? '▲' : '▼'}
              </button>
            </div>

            {showManageOptions && (
              <div style={{
                margin: '6px 0 16px', padding: '14px 18px', background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid #38bdf8', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 13, color: '#38bdf8', fontWeight: 700 }}>🏥 Manage Master Anatomical Structures & Saved Dropdowns</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Add new organ check items or click "🗑️ Remove Structure" to delete an anatomical item entirely from your hospital check list.</div>
                </div>

                {/* Add New Anatomical Structure Inline Bar */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', background: 'rgba(30, 41, 59, 0.9)', padding: '10px 14px', borderRadius: 8, border: '1px dashed rgba(56, 189, 248, 0.5)' }}>
                  <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>+ New Anatomical Item:</span>
                  <input
                    type="text"
                    value={newAnatomySection}
                    onChange={e => setNewAnatomySection(e.target.value)}
                    placeholder="Category (e.g. Face & Neck)"
                    style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'white', minWidth: 140 }}
                  />
                  <input
                    type="text"
                    value={newAnatomyStructureName}
                    onChange={e => setNewAnatomyStructureName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addAnatomyStructure()}
                    placeholder="Structure Name (e.g. Palate normal)"
                    style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'white', flex: 1, minWidth: 160 }}
                  />
                  <button
                    type="button"
                    onClick={addAnatomyStructure}
                    style={{ background: 'linear-gradient(to right, #0284c7, #0369a1)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Add Structure
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
                  {Object.entries(anatomyItems).map(([section, items]) => (
                    <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(30, 41, 59, 0.5)', padding: 10, borderRadius: 8, border: '1px solid rgba(51, 65, 85, 0.8)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', borderBottom: '1px solid rgba(100, 116, 139, 0.3)', paddingBottom: 4 }}>
                        📂 Category: {section} ({items.length} structures)
                      </div>
                      {items.map(item => {
                        const itemKey = `${section}:${item}`
                        const opts = customAnatomyOptions[itemKey] || []
                        return (
                          <div key={itemKey} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', background: 'rgba(15, 23, 42, 0.7)', borderRadius: 6, border: '1px solid rgba(51, 65, 85, 0.5)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                              <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600 }}>🩺 {item}</span>
                              <button
                                type="button"
                                onClick={() => removeAnatomyStructure(section, item)}
                                style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                title={`Delete ${item} structure completely`}
                              >
                                🗑️ Remove Structure
                              </button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                              <span style={{ fontSize: 10, color: '#64748b' }}>Saved Dropdown Choices:</span>
                              {opts.length === 0 ? (
                                <span style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>None (Standard Normal/Abnormal/Not Seen)</span>
                              ) : (
                                opts.map(opt => (
                                  <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', background: 'rgba(30, 41, 59, 0.9)', border: '1px solid #0284c7', borderRadius: 12, fontSize: 11, color: '#e2e8f0' }}>
                                    <span>{opt}</span>
                                    <button
                                      type="button"
                                      onClick={() => deleteCustomAnatomyOption(itemKey, opt)}
                                      style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 'bold', fontSize: 11 }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {Object.entries(anatomyItems).map(([section, items]) => {
              const allChecked = items.every(i => anatomyChecked[`${section}:${i}`] !== false)
              return (
                <Section key={section} title={`Anatomy: ${section}`} rightElement={
                  <button 
                    type="button" 
                    onClick={() => toggleSectionCheck(section, items, allChecked)}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {allChecked ? 'Uncheck All' : 'Check All'}
                  </button>
                }>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px' }}>
                    {items.map(item => {
                      const key = `${section}:${item}`
                      const isChecked = anatomyChecked[key] !== false
                      const val = anatomy[key] || 'normal'
                      const isAbn = val === 'abnormal' || (val && (val.toLowerCase().includes('abnormal') || val.toLowerCase().includes('cyst') || val.toLowerCase().includes('defect') || val.toLowerCase().includes('cpam')))
                      const isNotSeen = val === 'not_seen' || val === 'not seen'
                      const isCustom = !['normal', 'abnormal', 'not_seen'].includes(val)
                      const itemOptions = customAnatomyOptions[key] || []

                      return (
                        <div key={item} style={{ 
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          padding: '8px 12px', borderRadius: 8, 
                          background: isChecked ? (isAbn ? 'rgba(239, 68, 68, 0.12)' : isNotSeen ? 'rgba(245, 158, 11, 0.1)' : isCustom ? 'rgba(14, 165, 233, 0.1)' : 'rgba(15, 23, 42, 0.6)') : 'rgba(15, 23, 42, 0.25)',
                          border: `1px solid ${isChecked ? (isAbn ? 'rgba(239, 68, 68, 0.4)' : isNotSeen ? 'rgba(245, 158, 11, 0.3)' : isCustom ? 'rgba(14, 165, 233, 0.4)' : 'rgba(51, 65, 85, 0.6)') : 'transparent'}`,
                          opacity: isChecked ? 1 : 0.45,
                          transition: 'all 0.2s'
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, userSelect: 'none' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => setAnatomyChecked(c => ({ ...c, [key]: e.target.checked }))}
                              style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#0ea5e9' }}
                            />
                            <span style={{ fontSize: 12, color: isChecked ? (isAbn ? '#f87171' : isNotSeen ? '#fbbf24' : isCustom ? '#38bdf8' : '#f1f5f9') : '#64748b', fontWeight: (isAbn || isCustom) ? 700 : 500 }}>
                              {item}
                            </span>
                          </label>

                          {isChecked ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {addingOptionKey === key ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <input
                                    className="fmf-input"
                                    autoFocus
                                    type="text"
                                    placeholder="New option (e.g. cyst)..."
                                    value={newOptionValue}
                                    onChange={e => setNewOptionValue(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') { e.preventDefault(); saveNewAnatomyOption(key); }
                                      if (e.key === 'Escape') setAddingOptionKey(null);
                                    }}
                                    style={{ width: 150, padding: '4px 8px', fontSize: 11, background: '#0f172a', color: '#f1f5f9', borderColor: '#0ea5e9' }}
                                  />
                                  <button
                                    type="button"
                                    title="Save to dropdown & select"
                                    onClick={() => saveNewAnatomyOption(key)}
                                    style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}
                                  >✓</button>
                                  <button
                                    type="button"
                                    title="Cancel"
                                    onClick={() => setAddingOptionKey(null)}
                                    style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 11 }}
                                  >✕</button>
                                </div>
                              ) : (
                                <>
                                  <select 
                                    className="fmf-select" 
                                    style={{ 
                                      width: 135, padding: '4px 8px', fontSize: 11,
                                      background: isAbn ? '#450a0a' : isNotSeen ? '#451a03' : isCustom ? '#0c4a6e' : '#1e293b',
                                      color: isAbn ? '#fca5a5' : isNotSeen ? '#fde68a' : isCustom ? '#7dd3fc' : '#f1f5f9',
                                      borderColor: isAbn ? '#ef4444' : isNotSeen ? '#f59e0b' : isCustom ? '#0284c7' : '#334155',
                                      fontWeight: (isAbn || isNotSeen || isCustom) ? 700 : 500,
                                      borderRadius: 6,
                                      textOverflow: 'ellipsis'
                                    }}
                                    value={val}
                                    onChange={e => {
                                      if (e.target.value === '__ADD_NEW__') {
                                        setAddingOptionKey(key)
                                        setNewOptionValue('')
                                      } else {
                                        setAnatomy(a => ({...a, [key]: e.target.value}))
                                      }
                                    }}
                                  >
                                    <option value="normal">✓ Normal</option>
                                    <option value="abnormal">⚠ Abnormal</option>
                                    <option value="not_seen">👁 Not seen</option>
                                    {itemOptions.map(opt => (
                                      <option key={opt} value={opt}>• {opt}</option>
                                    ))}
                                    <option value="__ADD_NEW__" style={{ color: '#38bdf8', fontWeight: 'bold' }}>➕ + Add New Value...</option>
                                  </select>

                                  <button
                                    type="button"
                                    title={`Add a saved choice specifically to ${item}`}
                                    onClick={() => { setAddingOptionKey(key); setNewOptionValue(''); }}
                                    style={{
                                      background: 'rgba(14, 165, 233, 0.15)', border: '1px solid rgba(14, 165, 233, 0.4)',
                                      color: '#38bdf8', padding: '4px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600, whiteSpace: 'nowrap'
                                    }}
                                  >
                                    <span>+</span> Value
                                  </button>

                                  {isCustom && (
                                    <button
                                      type="button"
                                      title={`Remove "${val}" from ${item}'s choices`}
                                      onClick={() => deleteCustomAnatomyOption(key, val)}
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
                                        color: '#f87171', padding: '4px 6px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                      }}
                                    >
                                      🗑️
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic' }}>Not done</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  
                  {/* Dynamic Custom Structure Input */}
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed rgba(51, 65, 85, 0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      className="fmf-input"
                      type="text"
                      placeholder={`+ Add custom organ / finding to ${section}...`}
                      value={newAnatomyInput[section] || ''}
                      onChange={e => setNewAnatomyInput(n => ({ ...n, [section]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomAnatomyItem(section); } }}
                      style={{ width: 280, padding: '6px 12px', fontSize: 11, background: 'rgba(15, 23, 42, 0.5)', borderColor: 'rgba(56, 189, 248, 0.3)' }}
                    />
                    <button
                      type="button"
                      onClick={() => addCustomAnatomyItem(section)}
                      style={{
                        background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.4)',
                        color: '#38bdf8', padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s'
                      }}
                    >
                      + Add Structure
                    </button>
                  </div>
                  {/* Special measures for Head */}
                  {section === 'Head' && (
                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed rgba(51,65,85,0.6)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 3 }}>Lateral Vent. (mm)</label>
                        <input className="fmf-input" placeholder="e.g. < 10.0" value={customMeasures.lv} onChange={e=>setCustomMeasures(c=>({...c,lv:e.target.value}))} style={{ padding: '6px 10px', fontSize: 12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 3 }}>Nuchal Thick. (mm)</label>
                        <input className="fmf-input" placeholder="e.g. < 6.0" value={customMeasures.nt} onChange={e=>setCustomMeasures(c=>({...c,nt:e.target.value}))} style={{ padding: '6px 10px', fontSize: 12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 3 }}>Cisterna Magna (mm)</label>
                        <input className="fmf-input" placeholder="e.g. 2.0 - 10.0" value={customMeasures.cm} onChange={e=>setCustomMeasures(c=>({...c,cm:e.target.value}))} style={{ padding: '6px 10px', fontSize: 12 }} />
                      </div>
                    </div>
                  )}
                </Section>
              )
            })}

            <Section title="5. Summary / Remarks & Impression">
              <textarea
                className="fmf-input"
                rows={4}
                placeholder="Enter sonographic findings, impression, and clinical recommendations..."
                value={summary}
                onChange={e=>setSummary(e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: '10px 12px' }}
              />
            </Section>
          </>}

          {tab === 'doppler' && (
            <Section title="Doppler Assessment" icon={Stethoscope}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
                  Uterine Artery Pulsatilization Index (UtA PI)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Left UtA PI</label>
                    <input className="fmf-input" type="number" step="0.01" placeholder="Mean ~1.05" value={dop.utaLeft} onChange={e=>setDop(d=>({...d, utaLeft:e.target.value}))} onBlur={calcDoppler} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Right UtA PI</label>
                    <input className="fmf-input" type="number" step="0.01" placeholder="Mean ~1.05" value={dop.utaRight} onChange={e=>setDop(d=>({...d, utaRight:e.target.value}))} onBlur={calcDoppler} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#0ea5e9', display: 'block', marginBottom: 4 }}>Mean UtA PI</label>
                    <div className="fmf-input" style={{ padding: '8px 12px', background: 'rgba(14,165,233,0.1)', borderColor: 'rgba(14,165,233,0.3)', fontWeight: 700, color: '#38bdf8', height: 37, display: 'flex', alignItems: 'center' }}>
                      {dopResult.uta_pi_mean?.toFixed(3) || (dop.utaLeft && dop.utaRight ? ((+dop.utaLeft + +dop.utaRight) / 2).toFixed(3) : '—')}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(51,65,85,0.5)', paddingTop: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
                  MCA - Peak Systolic Velocity (Fetal Anemia Assessment)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>MCA PSV (cm/s)</label>
                    <input className="fmf-input" type="number" step="0.1" placeholder="Enter measured cm/s" value={dop.mcaPsv} onChange={e=>setDop(d=>({...d, mcaPsv:e.target.value}))} onBlur={calcDoppler} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Expected MCA PSV at {patient.gaWeeksScan}w</label>
                    <div className="fmf-input" style={{ padding: '8px 12px', background: 'rgba(30,41,59,0.5)', color: '#94a3b8', height: 37, display: 'flex', alignItems: 'center' }}>
                      {dopResult.mca_psv_expected?.toFixed(1) || '—'} cm/s
                    </div>
                  </div>
                </div>
                {dopResult.mca_psv_mom != null && (
                  <div style={{ marginTop: 16, padding: 16, borderRadius: 8, background: dopResult.mca_psv_mom > 1.5 ? 'rgba(239,68,68,0.15)' : dopResult.mca_psv_mom > 1.29 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.12)', border: `1px solid ${dopResult.mca_psv_mom > 1.5 ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.3)'}` }}>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>MCA PSV MoM</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: dopResult.mca_psv_mom > 1.5 ? '#f87171' : dopResult.mca_psv_mom > 1.29 ? '#fbbf24' : '#34d399' }}>
                      {dopResult.mca_psv_mom.toFixed(2)} MoM
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: dopResult.mca_psv_mom > 1.5 ? '#f87171' : '#f1f5f9' }}>
                      {dopResult.mca_anemia_category}
                    </div>
                  </div>
                )}
              </div>

              {/* FETAL DOPPLER INDEXES & DUCTUS VENOSUS */}
              <div style={{ borderTop: '1px solid rgba(51,65,85,0.5)', paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
                  Fetal Doppler Vessel Analysis &amp; Ductus Venosus Assessment (Placental Insufficiency &amp; Aneuploidy)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Umbilical Artery PI (UmA PI)</label>
                    <input className="fmf-input" type="number" step="0.01" placeholder="Mean ~1.05" value={dop.umaPi} onChange={e=>setDop(d=>({...d, umaPi:e.target.value}))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Middle Cerebral Artery PI (MCA PI)</label>
                    <input className="fmf-input" type="number" step="0.01" placeholder="Mean ~1.85" value={dop.mcaPi} onChange={e=>setDop(d=>({...d, mcaPi:e.target.value}))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#38bdf8', display: 'block', marginBottom: 4 }}>Cerebroplacental Ratio (CPR = MCA/UmA)</label>
                    <div className="fmf-input" style={{ padding: '8px 12px', background: 'rgba(56,189,248,0.1)', borderColor: 'rgba(56,189,248,0.3)', fontWeight: 700, color: '#38bdf8', height: 37, display: 'flex', alignItems: 'center' }}>
                      {dop.mcaPi && dop.umaPi && +dop.umaPi !== 0 ? (+dop.mcaPi / +dop.umaPi).toFixed(2) : '—'} 
                      {dop.mcaPi && dop.umaPi && +dop.umaPi !== 0 && (+dop.mcaPi / +dop.umaPi) < 1.08 && (
                        <span style={{ fontSize: 10, color: '#f87171', marginLeft: 8 }}>⚠ Abnormal (&lt; 5th centile)</span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, padding: 14, background: 'rgba(15,23,42,0.6)', borderRadius: 10, border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#f43f5e', display: 'block', marginBottom: 4 }}>Ductus Venosus PIV</label>
                    <input className="fmf-input" type="number" step="0.01" placeholder="Mean ~0.50" value={dop.dvPiv} onChange={e=>setDop(d=>({...d, dvPiv:e.target.value}))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#f43f5e', display: 'block', marginBottom: 4 }}>Ductus Venosus A-wave Waveform Characterization</label>
                    <select className="fmf-select" value={dop.dvWave} onChange={e=>setDop(d=>({...d, dvWave:e.target.value}))} style={{ width: '100%', height: 37 }}>
                      <option value="Normal (Positive A-wave)">✓ Normal (Positive A-wave throughout cycle)</option>
                      <option value="Absent A-wave (Increased Cardiac Afterload)">⚠ Absent A-wave (Increased Cardiac Afterload / Risk Marker)</option>
                      <option value="Reversed A-wave (High Aneuploidy & FGR Risk)">🚨 Reversed A-wave (High Aneuploidy &amp; Severe FGR Risk)</option>
                    </select>
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* ─── TAB: RISK ENGINES ────────────────────────────────────────── */}
          {tab === 'risk' && (
            <div>
              <div style={{ margin: '0 0 12px', padding: '10px 14px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600 }}>
                  🛡️ Multi-Parameter Risk Engines <span style={{ color: '#cbd5e1', fontWeight: 400 }}>— Tick the boxes below to include any model's evaluation directly into a dedicated section at the end of your PDF report!</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setRiskChecked({ pe: true, trisomy: true, sga: true, gdm: true, preterm: true, soft_markers: true })} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, background: '#0369a1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>✓ Select All</button>
                  <button type="button" onClick={() => setRiskChecked({ pe: false, trisomy: false, sga: false, gdm: false, preterm: false, soft_markers: false })} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, background: '#334155', color: '#cbd5e1', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Deselect All</button>
                </div>
              </div>

              {/* Risk Engine Sub-Selector */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  { id: 'pe', label: '🤰 Preeclampsia', color: '#0ea5e9' },
                  { id: 'trisomy', label: '🧬 Trisomies', color: '#8b5cf6' },
                  { id: 'soft_markers', label: '🛡️ Soft Markers', color: '#a855f7' },
                  { id: 'sga', label: '👶 SGA / FGR', color: '#f59e0b' },
                  { id: 'gdm', label: '🩸 GDM Risk', color: '#ec4899' },
                  { id: 'preterm', label: '⏱️ Preterm Birth', color: '#10b981' }
                ].map(({ id, label }) => {
                  const isChecked = riskChecked[id] !== false
                  return (
                    <div
                      key={id}
                      onClick={() => setRiskSubTab(id as any)}
                      style={{
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                        background: riskSubTab === id ? 'rgba(14, 165, 233, 0.25)' : 'rgba(30, 41, 59, 0.7)',
                        border: `1px solid ${riskSubTab === id ? '#38bdf8' : isChecked ? 'rgba(16, 185, 129, 0.4)' : 'rgba(51, 65, 85, 0.6)'}`,
                        boxShadow: riskSubTab === id ? '0 0 10px rgba(56, 189, 248, 0.2)' : 'none',
                        transition: 'all 0.15s'
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: riskSubTab === id ? 700 : 600, color: riskSubTab === id ? '#f8fafc' : isChecked ? '#cbd5e1' : '#64748b' }}>
                        {label}
                      </span>
                      <input
                        type="checkbox"
                        title="Include in PDF Report Export"
                        checked={isChecked}
                        onChange={e => { e.stopPropagation(); setRiskChecked(c => ({ ...c, [id]: e.target.checked })); }}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#10b981', margin: 0 }}
                      />
                    </div>
                  )
                })}
              </div>

              {/* PREECLAMPSIA ENGINE */}
              {riskSubTab === 'pe' && (
                <Section 
                  title="FMF Preeclampsia Competing Risks Model" 
                  icon={ShieldAlert}
                  rightElement={
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: riskChecked.pe !== false ? '#34d399' : '#94a3b8', cursor: 'pointer', background: 'rgba(15, 23, 42, 0.9)', padding: '4px 10px', borderRadius: 6, border: `1px solid ${riskChecked.pe !== false ? '#10b981' : '#475569'}` }}>
                      <input type="checkbox" checked={riskChecked.pe !== false} onChange={e => setRiskChecked(c => ({ ...c, pe: e.target.checked }))} style={{ cursor: 'pointer', accentColor: '#10b981', width: 15, height: 15 }} />
                      <span>Include in Exported PDF Report</span>
                    </label>
                  }
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label className="field-label">Maternal Age (years)</label>
                      <input className="fmf-input" type="number" value={riskFactors.age} onChange={e=>setRiskFactors(r=>({...r, age:+e.target.value}))} />
                    </div>
                    <div>
                      <label className="field-label">Maternal BMI (kg/m²)</label>
                      <input className="fmf-input" type="number" step="0.1" value={riskFactors.bmi} onChange={e=>setRiskFactors(r=>({...r, bmi:+e.target.value}))} />
                    </div>
                    <div>
                      <label className="field-label">Ethnicity</label>
                      <select className="fmf-select" value={riskFactors.ethnicity} onChange={e=>setRiskFactors(r=>({...r, ethnicity:e.target.value}))}>
                        <option value="Caucasian">Caucasian</option>
                        <option value="South Asian">South Asian</option>
                        <option value="Black">Afro-Caribbean / Black</option>
                        <option value="East Asian">East Asian</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Mean Arterial Pressure (MAP mmHg)</label>
                      <input className="fmf-input" type="number" step="0.1" value={riskFactors.mapMmHg} onChange={e=>setRiskFactors(r=>({...r, mapMmHg:+e.target.value}))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                    <div>
                      <label className="field-label">UtA PI MoM</label>
                      <input className="fmf-input" type="number" step="0.01" value={riskFactors.utaPiMom} onChange={e=>setRiskFactors(r=>({...r, utaPiMom:+e.target.value}))} />
                    </div>
                    <div>
                      <label className="field-label">PlGF MoM</label>
                      <input className="fmf-input" type="number" step="0.01" value={riskFactors.plgfMom} onChange={e=>setRiskFactors(r=>({...r, plgfMom:+e.target.value}))} />
                    </div>
                    <div>
                      <label className="field-label">PAPP-A MoM</label>
                      <input className="fmf-input" type="number" step="0.01" value={riskFactors.pappaMom} onChange={e=>setRiskFactors(r=>({...r, pappaMom:+e.target.value}))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.chronicHtn} onChange={e=>setRiskFactors(r=>({...r, chronicHtn:e.target.checked}))} /> Chronic HTN
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.prevPe} onChange={e=>setRiskFactors(r=>({...r, prevPe:e.target.checked}))} /> Previous Preeclampsia
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.smoking} onChange={e=>setRiskFactors(r=>({...r, smoking:e.target.checked}))} /> Cigarette Smoking
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.familyHxPe} onChange={e=>setRiskFactors(r=>({...r, familyHxPe:e.target.checked}))} /> Family Hx of PE (Mother)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.sleAps} onChange={e=>setRiskFactors(r=>({...r, sleAps:e.target.checked}))} /> SLE / Antiphospholipid
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.nulliparous} onChange={e=>setRiskFactors(r=>({...r, nulliparous:e.target.checked}))} /> Nulliparous (First birth)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.diabetes} onChange={e=>setRiskFactors(r=>({...r, diabetes:e.target.checked}))} /> Pre-existing Diabetes
                    </label>
                  </div>

                  {riskResults.pe && (
                    <div style={{ padding: 16, borderRadius: 10, background: riskResults.pe.is_high_risk ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)', border: `1px solid ${riskResults.pe.is_high_risk ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.3)'}` }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 6 }}>Preeclampsia Risk Results</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center', marginBottom: 12 }}>
                        <div>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Early PE (&lt;34w)</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: riskResults.pe.is_high_risk ? '#f87171' : '#38bdf8' }}>{riskResults.pe.risk_pe_early_ratio}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Preterm PE (&lt;37w)</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: riskResults.pe.is_high_risk ? '#f87171' : '#38bdf8' }}>{riskResults.pe.risk_pe_preterm_ratio}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Term PE (&ge;37w)</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: '#cbd5e1' }}>{riskResults.pe.risk_pe_term_ratio}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: riskResults.pe.is_high_risk ? '#f87171' : '#34d399' }}>
                        💡 Clinical Recommendation: {riskResults.pe.recommendation}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* TRISOMIES ENGINE */}
              {riskSubTab === 'trisomy' && (
                <Section 
                  title="FMF 1st Trimester Combined Trisomy Screening" 
                  icon={Dna}
                  rightElement={
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: riskChecked.trisomy !== false ? '#34d399' : '#94a3b8', cursor: 'pointer', background: 'rgba(15, 23, 42, 0.9)', padding: '4px 10px', borderRadius: 6, border: `1px solid ${riskChecked.trisomy !== false ? '#10b981' : '#475569'}` }}>
                      <input type="checkbox" checked={riskChecked.trisomy !== false} onChange={e => setRiskChecked(c => ({ ...c, trisomy: e.target.checked }))} style={{ cursor: 'pointer', accentColor: '#10b981', width: 15, height: 15 }} />
                      <span>Include in Exported PDF Report</span>
                    </label>
                  }
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label className="field-label">Maternal Age</label>
                      <input className="fmf-input" type="number" value={riskFactors.age} onChange={e=>setRiskFactors(r=>({...r, age:+e.target.value}))} />
                    </div>
                    <div>
                      <label className="field-label">CRL (mm)</label>
                      <input className="fmf-input" type="number" step="0.1" value={riskFactors.crlMm} onChange={e=>setRiskFactors(r=>({...r, crlMm:+e.target.value}))} />
                    </div>
                    <div>
                      <label className="field-label">Nuchal Translucency (NT mm)</label>
                      <input className="fmf-input" type="number" step="0.1" value={riskFactors.ntMm} onChange={e=>setRiskFactors(r=>({...r, ntMm:+e.target.value}))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                    <div>
                      <label className="field-label">Free &beta;-hCG MoM</label>
                      <input className="fmf-input" type="number" step="0.01" value={riskFactors.freeHcgMom} onChange={e=>setRiskFactors(r=>({...r, freeHcgMom:+e.target.value}))} />
                    </div>
                    <div>
                      <label className="field-label">PAPP-A MoM</label>
                      <input className="fmf-input" type="number" step="0.01" value={riskFactors.pappaMom} onChange={e=>setRiskFactors(r=>({...r, pappaMom:+e.target.value}))} />
                    </div>
                    <div>
                      <label className="field-label">FHR (bpm)</label>
                      <input className="fmf-input" type="number" value={patient.fhrBpm} onChange={e=>setPatient(p=>({...p, fhrBpm:+e.target.value}))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                    <div>
                      <label className="field-label">Nasal Bone (FMF Marker)</label>
                      <select className="fmf-select" value={riskFactors.nasalBone} onChange={e=>setRiskFactors(r=>({...r, nasalBone:e.target.value}))}>
                        <option value="Normal">Normal / Present</option>
                        <option value="Absent">Absent / Not Seen</option>
                      </select>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer', paddingTop: 16 }}>
                      <input type="checkbox" checked={riskFactors.trRegurgitation} onChange={e=>setRiskFactors(r=>({...r, trRegurgitation:e.target.checked}))} /> Tricuspid Regurgitation
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer', paddingTop: 16 }}>
                      <input type="checkbox" checked={riskFactors.dvReversed} onChange={e=>setRiskFactors(r=>({...r, dvReversed:e.target.checked}))} /> Ductus Venosus Reversed Flow
                    </label>
                  </div>

                  {riskResults.trisomy && (
                    <div style={{ padding: 16, borderRadius: 10, background: riskResults.trisomy.t21_high_risk ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)', border: `1px solid ${riskResults.trisomy.t21_high_risk ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.3)'}` }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>Combined Trisomy Risk Results</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Trisomy 21 (Down)</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: riskResults.trisomy.t21_high_risk ? '#f87171' : '#38bdf8' }}>{riskResults.trisomy.comb_t21_ratio}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Trisomy 18 (Edwards)</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: riskResults.trisomy.t18_13_high_risk ? '#f87171' : '#38bdf8' }}>{riskResults.trisomy.comb_t18_ratio}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Trisomy 13 (Patau)</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: riskResults.trisomy.t18_13_high_risk ? '#f87171' : '#38bdf8' }}>{riskResults.trisomy.comb_t13_ratio}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: riskResults.trisomy.t21_high_risk ? '#f87171' : '#34d399' }}>
                        💡 Clinical Management: {riskResults.trisomy.recommendation}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* SGA / FGR ENGINE */}
              {riskSubTab === 'sga' && (
                <Section 
                  title="Small for Gestational Age (SGA / FGR) Risk Engine" 
                  icon={Baby}
                  rightElement={
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: riskChecked.sga !== false ? '#34d399' : '#94a3b8', cursor: 'pointer', background: 'rgba(15, 23, 42, 0.9)', padding: '4px 10px', borderRadius: 6, border: `1px solid ${riskChecked.sga !== false ? '#10b981' : '#475569'}` }}>
                      <input type="checkbox" checked={riskChecked.sga !== false} onChange={e => setRiskChecked(c => ({ ...c, sga: e.target.checked }))} style={{ cursor: 'pointer', accentColor: '#10b981', width: 15, height: 15 }} />
                      <span>Include in Exported PDF Report</span>
                    </label>
                  }
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label className="field-label">EFW Centile</label>
                      <input className="fmf-input" type="number" step="0.1" value={bio.efw_p || 50} disabled style={{ background: 'rgba(30,41,59,0.5)' }} />
                    </div>
                    <div>
                      <label className="field-label">UtA PI MoM</label>
                      <input className="fmf-input" type="number" step="0.01" value={riskFactors.utaPiMom} onChange={e=>setRiskFactors(r=>({...r, utaPiMom:+e.target.value}))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.smoking} onChange={e=>setRiskFactors(r=>({...r, smoking:e.target.checked}))} /> Cigarette Smoking
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.prevSga} onChange={e=>setRiskFactors(r=>({...r, prevSga:e.target.checked}))} /> Previous SGA Child
                    </label>
                  </div>

                  {riskResults.sga && (
                    <div style={{ padding: 16, borderRadius: 10, background: riskResults.sga.is_high_risk ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)', border: `1px solid ${riskResults.sga.is_high_risk ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.3)'}` }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>SGA Risk Summary</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Preterm SGA (&lt;37w)</span>
                          <span style={{ fontSize: 20, fontWeight: 800, color: riskResults.sga.is_high_risk ? '#f87171' : '#38bdf8' }}>{riskResults.sga.sga_preterm_ratio}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Term SGA (&ge;37w)</span>
                          <span style={{ fontSize: 20, fontWeight: 800, color: '#cbd5e1' }}>{riskResults.sga.sga_term_ratio}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: riskResults.sga.is_high_risk ? '#f87171' : '#34d399' }}>
                        💡 Protocol: {riskResults.sga.recommendation}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* GDM ENGINE */}
              {riskSubTab === 'gdm' && (
                <Section 
                  title="Gestational Diabetes Mellitus (GDM) Risk Engine" 
                  icon={Activity}
                  rightElement={
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: riskChecked.gdm !== false ? '#34d399' : '#94a3b8', cursor: 'pointer', background: 'rgba(15, 23, 42, 0.9)', padding: '4px 10px', borderRadius: 6, border: `1px solid ${riskChecked.gdm !== false ? '#10b981' : '#475569'}` }}>
                      <input type="checkbox" checked={riskChecked.gdm !== false} onChange={e => setRiskChecked(c => ({ ...c, gdm: e.target.checked }))} style={{ cursor: 'pointer', accentColor: '#10b981', width: 15, height: 15 }} />
                      <span>Include in Exported PDF Report</span>
                    </label>
                  }
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label className="field-label">Maternal BMI (kg/m²)</label>
                      <input className="fmf-input" type="number" step="0.1" value={riskFactors.bmi} onChange={e=>setRiskFactors(r=>({...r, bmi:+e.target.value}))} />
                    </div>
                    <div>
                      <label className="field-label">Ethnicity</label>
                      <select className="fmf-select" value={riskFactors.ethnicity} onChange={e=>setRiskFactors(r=>({...r, ethnicity:e.target.value}))}>
                        <option value="Caucasian">Caucasian</option>
                        <option value="South Asian">South Asian</option>
                        <option value="East Asian">East Asian</option>
                        <option value="Black">Black / Afro-Caribbean</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.familyDiabetes} onChange={e=>setRiskFactors(r=>({...r, familyDiabetes:e.target.checked}))} /> Family Hx of Diabetes
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.prevGdm} onChange={e=>setRiskFactors(r=>({...r, prevGdm:e.target.checked}))} /> Previous GDM
                    </label>
                  </div>

                  {riskResults.gdm && (
                    <div style={{ padding: 16, borderRadius: 10, background: riskResults.gdm.is_high_risk ? 'rgba(236, 72, 153, 0.15)' : 'rgba(16, 185, 129, 0.12)', border: `1px solid ${riskResults.gdm.is_high_risk ? 'rgba(236,72,153,0.4)' : 'rgba(16,185,129,0.3)'}` }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4 }}>Estimated GDM Risk Probability</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: riskResults.gdm.is_high_risk ? '#f472b6' : '#34d399' }}>
                        {riskResults.gdm.gdm_risk_percent}%
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: riskResults.gdm.is_high_risk ? '#f472b6' : '#34d399' }}>
                        💡 Screening Plan: {riskResults.gdm.recommendation}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* PRETERM BIRTH ENGINE */}
              {riskSubTab === 'preterm' && (
                <Section 
                  title="Spontaneous Preterm Birth Risk Engine (Cervix & History)" 
                  icon={Calendar}
                  rightElement={
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: riskChecked.preterm !== false ? '#34d399' : '#94a3b8', cursor: 'pointer', background: 'rgba(15, 23, 42, 0.9)', padding: '4px 10px', borderRadius: 6, border: `1px solid ${riskChecked.preterm !== false ? '#10b981' : '#475569'}` }}>
                      <input type="checkbox" checked={riskChecked.preterm !== false} onChange={e => setRiskChecked(c => ({ ...c, preterm: e.target.checked }))} style={{ cursor: 'pointer', accentColor: '#10b981', width: 15, height: 15 }} />
                      <span>Include in Exported PDF Report</span>
                    </label>
                  }
                >
                  <div style={{ marginBottom: 12 }}>
                    <label className="field-label">Transvaginal Cervical Length (CL mm)</label>
                    <input className="fmf-input" type="number" step="0.1" value={riskFactors.clMm} onChange={e=>setRiskFactors(r=>({...r, clMm:+e.target.value}))} placeholder="Normal mean ~36 mm" />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.prevPreterm34} onChange={e=>setRiskFactors(r=>({...r, prevPreterm34:e.target.checked}))} /> Prior Delivery &lt;34w
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.prevPreterm37} onChange={e=>setRiskFactors(r=>({...r, prevPreterm37:e.target.checked}))} /> Prior Delivery &lt;37w
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={riskFactors.cervicalSurgery} onChange={e=>setRiskFactors(r=>({...r, cervicalSurgery:e.target.checked}))} /> Prior Cone / LLETZ Surgery
                    </label>
                  </div>

                  {riskResults.preterm && (
                    <div style={{ padding: 16, borderRadius: 10, background: riskResults.preterm.is_high_risk ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)', border: `1px solid ${riskResults.preterm.is_high_risk ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.3)'}` }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>Preterm Delivery Probability</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Delivery &lt;34 weeks</span>
                          <span style={{ fontSize: 20, fontWeight: 800, color: riskResults.preterm.is_high_risk ? '#f87171' : '#38bdf8' }}>{riskResults.preterm.preterm_34_ratio}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Delivery &lt;37 weeks</span>
                          <span style={{ fontSize: 20, fontWeight: 800, color: '#cbd5e1' }}>{riskResults.preterm.preterm_37_ratio}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: riskResults.preterm.is_high_risk ? '#f87171' : '#34d399' }}>
                        💡 Clinical Management: {riskResults.preterm.recommendation}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* TRISOMY TEMPLATE SOFT MARKERS */}
              {riskSubTab === 'soft_markers' && (
                <Section
                  title="Trisomy Template Aneuploidy Soft Markers (2nd Trimester Screening)"
                  icon={Activity}
                  rightElement={
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: riskChecked.soft_markers !== false ? '#a855f7' : '#94a3b8', cursor: 'pointer', background: 'rgba(15, 23, 42, 0.9)', padding: '4px 10px', borderRadius: 6, border: `1px solid ${riskChecked.soft_markers !== false ? '#a855f7' : '#475569'}` }}>
                      <input type="checkbox" checked={riskChecked.soft_markers !== false} onChange={e => setRiskChecked(c => ({ ...c, soft_markers: e.target.checked }))} style={{ cursor: 'pointer', accentColor: '#a855f7', width: 15, height: 15 }} />
                      <span>Include in Exported PDF Report</span>
                    </label>
                  }
                >
                  <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 16, background: 'rgba(30,41,59,0.5)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(51,65,85,0.4)' }}>
                    💡 <b>Clinical Guidance:</b> Assess ultrasound soft markers for fetal aneuploidy screening. Custom findings are saved specifically to their anatomical marker in persistent local storage—you can easily add new findings or delete obsolete entries with a single click.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                    {Object.entries(softMarkers).map(([mKey, mVal]) => {
                      const customOpts = softMarkerCustom[mKey] || []
                      const defaultOpts = ['Normal / Present', 'Normal (< 6mm)', 'Absent', 'Normal length', 'Three vessels present', 'Normal layout', 'Normal / Absent']
                      const allOpts = Array.from(new Set([mVal, ...defaultOpts, ...customOpts]))
                      return (
                        <div key={mKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 14px', background: 'rgba(15,23,42,0.6)', borderRadius: 8, border: '1px solid rgba(51,65,85,0.4)' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', minWidth: '240px' }}>{mKey}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' }}>
                            {addingSoftMarkerKey === mKey ? (
                              <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: '350px' }}>
                                <input
                                  type="text"
                                  className="fmf-input"
                                  placeholder="Enter specific custom finding..."
                                  value={newSoftMarkerValue}
                                  onChange={e => setNewSoftMarkerValue(e.target.value)}
                                  style={{ height: 33, fontSize: 12 }}
                                />
                                <button type="button" onClick={() => saveNewSoftMarkerOption(mKey)} style={{ padding: '0 12px', background: '#10b981', color: 'white', borderRadius: 6, border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Save</button>
                                <button type="button" onClick={() => setAddingSoftMarkerKey(null)} style={{ padding: '0 10px', background: '#475569', color: 'white', borderRadius: 6, border: 'none', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                              </div>
                            ) : (
                              <>
                                <select
                                  className="fmf-select"
                                  value={mVal}
                                  onChange={e => setSoftMarkers(s => ({ ...s, [mKey]: e.target.value }))}
                                  style={{ maxWidth: '320px', height: 34, fontSize: 12 }}
                                >
                                  {allOpts.map((opt, idx) => (
                                    <option key={idx} value={opt}>{opt}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => { setAddingSoftMarkerKey(mKey); setNewSoftMarkerValue(''); }}
                                  style={{ padding: '6px 12px', background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                  + Add Custom Finding
                                </button>
                                {customOpts.includes(mVal) && (
                                  <button
                                    type="button"
                                    title="Delete this custom option from storage"
                                    onClick={() => { deleteSoftMarkerOption(mKey, mVal); setSoftMarkers(s => ({ ...s, [mKey]: defaultOpts[0] })); }}
                                    style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                                  >
                                    🗑️ Delete Option
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — Live Results */}
        <div>
          <Section title="Live Results" icon={FileText}>
            {[
              { label: 'BPD', z: bio.bpd_z, p: bio.bpd_p },
              { label: 'HC',  z: bio.hc_z,  p: bio.hc_p },
              { label: 'AC',  z: bio.ac_z,  p: bio.ac_p },
              { label: 'FL',  z: bio.fl_z,  p: bio.fl_p },
            ].map(r => (
              <div key={r.label} className="result-row">
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', minWidth: 30 }}>{r.label}</span>
                {r.z != null ? (
                  <div style={{ textAlign: 'right' }}>
                    <span className={centileClass(r.p)} style={{ fontSize: 12 }}>{centileLabel(r.p)}</span>
                    <span style={{ display: 'block', fontSize: 10, color: '#64748b', marginTop: 2 }}>Z: {r.z.toFixed(2)}</span>
                  </div>
                ) : <span style={{ fontSize: 11, color: '#475569' }}>—</span>}
              </div>
            ))}

            {/* EFW */}
            {bio.efw_grams && (
              <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: 'linear-gradient(135deg, rgba(14,165,233,0.15), rgba(99,102,241,0.15))', border: '1px solid rgba(14,165,233,0.3)' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Est. Fetal Weight (Hadlock)</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#38bdf8', letterSpacing: '-1px' }}>
                  {Math.round(bio.efw_grams)} g
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
                  <span className={centileClass(bio.efw_p)} style={{ fontSize: 13 }}>{centileLabel(bio.efw_p)}</span>
                  <span className={efwClass(bio.efw_category)} style={{ fontSize: 13 }}>{bio.efw_category}</span>
                </div>
              </div>
            )}
          </Section>

          <Section title="📈 PDF Growth &amp; Doppler Charts" icon={TrendingUp}>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 10 }}>
              Select percentile curves &amp; Doppler graphs to render into your exported PDF report:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '280px', overflowY: 'auto', padding: '6px', background: 'rgba(15,23,42,0.6)', borderRadius: 8, border: '1px solid rgba(51,65,85,0.4)' }}>
              
              {/* Module 1: Fetal Growth */}
              <div style={{ background: 'rgba(30,41,59,0.5)', padding: '8px 10px', borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>📊 Fetal Growth (14-42w)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { key: 'bpd', label: 'Biparietal Diameter (BPD Curve)' },
                    { key: 'hc', label: 'Head Circumference (HC Curve)' },
                    { key: 'ac', label: 'Abdominal Circumference (AC Curve)' },
                    { key: 'fl', label: 'Femur Length (FL Curve)' },
                    { key: 'efw', label: 'Estimated Fetal Weight (EFW Curve)' },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: selectedGraphs[key] !== false ? '#e2e8f0' : '#64748b', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedGraphs[key] !== false} onChange={e => setSelectedGraphs(g => ({ ...g, [key]: e.target.checked }))} style={{ accentColor: '#0284c7', width: 15, height: 15 }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Module 2: Fetal & Maternal Doppler */}
              <div style={{ background: 'rgba(30,41,59,0.5)', padding: '8px 10px', borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>💓 Fetal Doppler &amp; Ductus Venosus</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { key: 'uma_pi', label: 'Umbilical Artery PI (UmA PI)' },
                    { key: 'mca_pi', label: 'Middle Cerebral Artery PI (MCA PI)' },
                    { key: 'cpr', label: 'Cerebroplacental Ratio (CPR)' },
                    { key: 'uta_pi', label: 'Mean Uterine Artery PI (UtA PI)' },
                    { key: 'dv_piv', label: 'Ductus Venosus PIV (DV PIV)' },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: selectedGraphs[key] !== false ? '#e2e8f0' : '#64748b', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedGraphs[key] !== false} onChange={e => setSelectedGraphs(g => ({ ...g, [key]: e.target.checked }))} style={{ accentColor: '#f43f5e', width: 15, height: 15 }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Module 3: First Trimester NT */}
              <div style={{ background: 'rgba(30,41,59,0.5)', padding: '8px 10px', borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>👶 1st Trimester Screen</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: selectedGraphs['nt'] !== false ? '#e2e8f0' : '#64748b', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedGraphs['nt'] !== false} onChange={e => setSelectedGraphs(g => ({ ...g, nt: e.target.checked }))} style={{ accentColor: '#10b981', width: 15, height: 15 }} />
                  Nuchal Translucency vs CRL (NT Chart)
                </label>
              </div>

            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setSelectedGraphs({ bpd: true, hc: true, ac: true, fl: true, efw: true, uta_pi: true, uma_pi: true, mca_pi: true, cpr: true, dv_piv: true, nt: true })} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: '#0284c7', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>✓ Select All Charts</button>
              <button type="button" onClick={() => setSelectedGraphs({ bpd: false, hc: false, ac: false, fl: false, efw: false, uta_pi: false, uma_pi: false, mca_pi: false, cpr: false, dv_piv: false, nt: false })} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: '#334155', color: '#cbd5e1', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Deselect All</button>
            </div>
          </Section>

          <Section title="Sonologist Signature">
            <Field label="Doctor Name" value={patient.refDoc} onChange={(v:string)=>setPatient(p=>({...p, refDoc:v}))} />
            <Field label="Registration Number" value="G-10577" onChange={()=>{}} />
            <Field label="FMF Certified ID" value="131606" onChange={()=>{}} />
            <div style={{ marginTop: 16 }}>
              <button className="btn-success" style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 14, fontWeight: 700 }} onClick={generatePdf}>
                <Printer size={16} /> Generate Diagnostic PDF
              </button>
            </div>
          </Section>
        </div>
      </div>
      </div>
    </>
  )
}
