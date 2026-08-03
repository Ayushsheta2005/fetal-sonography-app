import { useState, useEffect } from 'react'
import axios from 'axios'
import { Baby, FileText, Activity, Users, Calendar, TrendingUp, ChevronRight, Clock } from 'lucide-react'

const API = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:8000'

type Page = 'home' | 'scan' | 'history'

interface Report {
  id: string
  created_at: string
  patient_id: string
  patient_name: string
  ga_days: number
  efw_grams: number | null
}

interface HomePageProps {
  onNavigate: (page: Page) => void
}

function gaLabel(days: number) {
  if (!days) return '—'
  return `${Math.floor(days / 7)}w ${days % 7}d`
}

function efwBadge(efw: number | null) {
  if (!efw) return null
  const color = efw < 2500 ? '#f87171' : efw > 4000 ? '#fbbf24' : '#34d399'
  const label = efw < 2500 ? 'SGA' : efw > 4000 ? 'LGA' : 'AGA'
  return (
    <span style={{
      background: `${color}22`, border: `1px solid ${color}55`,
      color, padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700
    }}>{label} {Math.round(efw)}g</span>
  )
}

function timeAgo(isoStr: string) {
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/db/reports?limit=5`)
      .then(r => setReports(r.data.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const today = new Date().toDateString()
  const todayCount = reports.filter(r => new Date(r.created_at).toDateString() === today).length
  const totalCount = reports.length

  const stats = [
    { icon: <Activity size={22} color="#38bdf8" />, label: 'Scans Today', value: loading ? '—' : todayCount, color: '#38bdf8' },
    { icon: <Users size={22} color="#a78bfa" />, label: 'Total Scans (DB)', value: loading ? '—' : totalCount, color: '#a78bfa' },
    { icon: <TrendingUp size={22} color="#34d399" />, label: 'Platform Status', value: '● Live', color: '#34d399' },
    { icon: <Calendar size={22} color="#fbbf24" />, label: 'Today', value: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), color: '#fbbf24' },
  ]

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      background: 'linear-gradient(135deg, #020817 0%, #0c1631 50%, #020817 100%)',
      padding: '32px 20px',
      display: 'flex', flexDirection: 'column', gap: 28, alignItems: 'center'
    }}>
      {/* Hero Title */}
      <div style={{ textAlign: 'center', maxWidth: 600 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)',
          borderRadius: 20, padding: '5px 14px', marginBottom: 16
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
          <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600, letterSpacing: '0.5px' }}>
            CLOUD-CONNECTED · FMF CERTIFIED
          </span>
        </div>
        <h1 style={{
          fontSize: 'clamp(24px, 5vw, 38px)', fontWeight: 900, color: '#f1f5f9',
          margin: '0 0 10px', letterSpacing: '-1px', lineHeight: 1.15
        }}>
          Advanced Fetal Diagnostic
          <span style={{ display: 'block', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Reporting Platform
          </span>
        </h1>
        <p style={{ fontSize: 14, color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
          FMF · Hadlock · ISUOG Level-II Protocol. Generate publication-grade diagnostic reports in seconds.
        </p>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 14, width: '100%', maxWidth: 700
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            background: 'rgba(15,23,42,0.8)', border: `1px solid ${s.color}33`,
            borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
            backdropFilter: 'blur(10px)', boxShadow: `0 4px 20px ${s.color}11`
          }}>
            {s.icon}
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 18, width: '100%', maxWidth: 700
      }}>
        {/* New Scan Card */}
        <button
          type="button"
          onClick={() => onNavigate('scan')}
          style={{
            background: 'linear-gradient(135deg, rgba(14,165,233,0.15) 0%, rgba(99,102,241,0.15) 100%)',
            border: '1px solid rgba(56,189,248,0.4)',
            borderRadius: 16, padding: '28px 24px',
            cursor: 'pointer', textAlign: 'left', transition: 'all 0.25s ease',
            boxShadow: '0 8px 32px rgba(14,165,233,0.1)'
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 16px 40px rgba(14,165,233,0.25)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(14,165,233,0.1)'
          }}
        >
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, boxShadow: '0 4px 16px rgba(14,165,233,0.4)'
          }}>
            <Baby size={26} color="white" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>
            New Diagnostic Scan
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginBottom: 16 }}>
            Enter biometry, Doppler values, anatomy checklist & generate a professional FMF-standard PDF report.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontSize: 12, fontWeight: 600 }}>
            Start Scan <ChevronRight size={14} />
          </div>
        </button>

        {/* Patient History Card */}
        <button
          type="button"
          onClick={() => onNavigate('history')}
          style={{
            background: 'linear-gradient(135deg, rgba(167,139,250,0.12) 0%, rgba(236,72,153,0.1) 100%)',
            border: '1px solid rgba(167,139,250,0.35)',
            borderRadius: 16, padding: '28px 24px',
            cursor: 'pointer', textAlign: 'left', transition: 'all 0.25s ease',
            boxShadow: '0 8px 32px rgba(167,139,250,0.08)'
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 16px 40px rgba(167,139,250,0.2)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(167,139,250,0.08)'
          }}
        >
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, boxShadow: '0 4px 16px rgba(167,139,250,0.4)'
          }}>
            <FileText size={26} color="white" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>
            Patient History
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginBottom: 16 }}>
            Search past scans by patient name or ID, filter by date range or GA, and re-open any archived diagnostic report.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a78bfa', fontSize: 12, fontWeight: 600 }}>
            View Records <ChevronRight size={14} />
          </div>
        </button>
      </div>

      {/* Recent Scans Strip */}
      {reports.length > 0 && (
        <div style={{ width: '100%', maxWidth: 700 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} color="#64748b" /> Recent Scans
            </div>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              style={{ fontSize: 11, color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              View All <ChevronRight size={12} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reports.slice(0, 5).map(r => (
              <div key={r.id} style={{
                background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.6)',
                borderRadius: 10, padding: '10px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Baby size={16} color="#38bdf8" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{r.patient_name || 'Anonymous'}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>ID: {r.patient_id} · GA: {gaLabel(r.ga_days)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {efwBadge(r.efw_grams)}
                  <span style={{ fontSize: 10, color: '#475569' }}>{timeAgo(r.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>Loading clinical data…</div>
      )}

      {/* Footer */}
      <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', paddingTop: 8 }}>
        Powered by FMF Biometry Engine · Supabase Cloud DB · Render API · Vercel CDN
      </div>
    </div>
  )
}
