import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Search, Baby, FileText, Filter, ChevronLeft, ChevronRight, Download, RefreshCw, Calendar, X } from 'lucide-react'

const API = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:8000'

interface Report {
  id: string
  created_at: string
  patient_id: string
  patient_name: string
  ga_days: number
  efw_grams: number | null
  report_data?: Record<string, unknown>
}

const PAGE_SIZE = 10

function gaLabel(days: number) {
  if (!days) return '—'
  return `${Math.floor(days / 7)}w ${days % 7}d`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function EfwBadge({ efw }: { efw: number | null }) {
  if (!efw) return <span style={{ fontSize: 11, color: '#475569' }}>EFW: —</span>
  const color = efw < 2500 ? '#f87171' : efw > 4000 ? '#fbbf24' : '#34d399'
  const label = efw < 2500 ? 'SGA' : efw > 4000 ? 'LGA' : 'AGA'
  return (
    <span style={{
      background: `${color}22`, border: `1px solid ${color}55`,
      color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700
    }}>{label} · {Math.round(efw)}g</span>
  )
}

export default function HistoryPage() {
  const [allReports, setAllReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all')
  const [efwFilter, setEfwFilter] = useState<'all' | 'SGA' | 'AGA' | 'LGA'>('all')
  const [gaMin, setGaMin] = useState('')
  const [gaMax, setGaMax] = useState('')
  const [page, setPage] = useState(1)
  const [regenLoading, setRegenLoading] = useState<string | null>(null)

  const fetchReports = useCallback(() => {
    setLoading(true)
    axios.get(`${API}/db/reports?limit=200`)
      .then(r => setAllReports(r.data.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  // --- Filter Logic ---
  const filtered = allReports.filter(r => {
    // Search by name or ID
    const q = searchQ.toLowerCase()
    if (q && !(r.patient_name?.toLowerCase().includes(q) || r.patient_id?.toLowerCase().includes(q))) return false

    // Date filter
    const created = new Date(r.created_at)
    const now = new Date()
    if (dateFilter === 'today') {
      if (created.toDateString() !== now.toDateString()) return false
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 86400000)
      if (created < weekAgo) return false
    } else if (dateFilter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 86400000)
      if (created < monthAgo) return false
    }

    // EFW category filter
    if (efwFilter !== 'all' && r.efw_grams) {
      const cat = r.efw_grams < 2500 ? 'SGA' : r.efw_grams > 4000 ? 'LGA' : 'AGA'
      if (cat !== efwFilter) return false
    }

    // GA range filter
    const gaWeeks = r.ga_days ? r.ga_days / 7 : null
    if (gaMin && gaWeeks !== null && gaWeeks < parseFloat(gaMin)) return false
    if (gaMax && gaWeeks !== null && gaWeeks > parseFloat(gaMax)) return false

    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const resetFilters = () => {
    setSearchQ(''); setDateFilter('all'); setEfwFilter('all'); setGaMin(''); setGaMax(''); setPage(1)
  }
  const hasFilters = searchQ || dateFilter !== 'all' || efwFilter !== 'all' || gaMin || gaMax

  const regenPdf = async (r: Report) => {
    if (!r.report_data) {
      alert('Full report data not available for this scan — only scans generated after the cloud DB integration can be regenerated.')
      return
    }
    setRegenLoading(r.id)
    try {
      const res = await axios.post(`${API}/report/pdf/regenerate`, r.report_data, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = `fetal_report_${r.patient_id}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Could not regenerate PDF. Check that your backend is online.')
    } finally {
      setRegenLoading(null)
    }
  }

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      background: 'linear-gradient(135deg, #020817 0%, #0c1631 50%, #020817 100%)',
      padding: '24px 20px',
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={20} color="#a78bfa" /> Patient Scan History
            </h2>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {loading ? 'Loading…' : `${filtered.length} record${filtered.length !== 1 ? 's' : ''} found · ${allReports.length} total in database`}
            </div>
          </div>
          <button
            type="button"
            onClick={fetchReports}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 8, color: '#38bdf8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Search + Filters */}
        <div style={{
          background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(56,189,248,0.2)',
          borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12
        }}>
          {/* Search Bar */}
          <div style={{ position: 'relative' }}>
            <Search size={16} color="#64748b" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={searchQ}
              onChange={e => { setSearchQ(e.target.value); setPage(1) }}
              placeholder="Search by patient name or patient ID…"
              style={{
                width: '100%', padding: '10px 12px 10px 38px',
                background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(51,65,85,0.8)',
                borderRadius: 10, color: '#e2e8f0', fontSize: 13, outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Filter Row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <Filter size={13} color="#64748b" />

            {/* Date Filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'today', 'week', 'month'] as const).map(d => (
                <button key={d} type="button"
                  onClick={() => { setDateFilter(d); setPage(1) }}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: dateFilter === d ? 'rgba(56,189,248,0.2)' : 'rgba(30,41,59,0.7)',
                    border: `1px solid ${dateFilter === d ? '#38bdf8' : 'rgba(51,65,85,0.5)'}`,
                    color: dateFilter === d ? '#38bdf8' : '#94a3b8'
                  }}>
                  {d === 'all' ? 'All Time' : d === 'today' ? 'Today' : d === 'week' ? 'This Week' : 'This Month'}
                </button>
              ))}
            </div>

            {/* EFW Category */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'SGA', 'AGA', 'LGA'] as const).map(e => {
                const color = e === 'SGA' ? '#f87171' : e === 'LGA' ? '#fbbf24' : e === 'AGA' ? '#34d399' : '#94a3b8'
                return (
                  <button key={e} type="button"
                    onClick={() => { setEfwFilter(e); setPage(1) }}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: efwFilter === e ? `${color}22` : 'rgba(30,41,59,0.7)',
                      border: `1px solid ${efwFilter === e ? color : 'rgba(51,65,85,0.5)'}`,
                      color: efwFilter === e ? color : '#94a3b8'
                    }}>
                    {e === 'all' ? 'All EFW' : e}
                  </button>
                )
              })}
            </div>

            {/* GA Range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={12} color="#64748b" />
              <input type="number" min={8} max={42} value={gaMin}
                onChange={e => { setGaMin(e.target.value); setPage(1) }}
                placeholder="GA min (w)"
                style={{ width: 82, padding: '4px 8px', background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: 6, color: '#e2e8f0', fontSize: 11 }} />
              <span style={{ color: '#475569', fontSize: 11 }}>–</span>
              <input type="number" min={8} max={42} value={gaMax}
                onChange={e => { setGaMax(e.target.value); setPage(1) }}
                placeholder="GA max (w)"
                style={{ width: 82, padding: '4px 8px', background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: 6, color: '#e2e8f0', fontSize: 11 }} />
            </div>

            {hasFilters && (
              <button type="button" onClick={resetFilters}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#f87171', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                <X size={11} /> Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Records List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#475569', fontSize: 13 }}>Loading patient records from cloud database…</div>
        ) : pageItems.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 48, background: 'rgba(15,23,42,0.5)',
            border: '1px solid rgba(51,65,85,0.5)', borderRadius: 14, color: '#475569', fontSize: 13
          }}>
            {allReports.length === 0
              ? 'No scans have been archived yet. Generate your first PDF report to start building the patient database!'
              : 'No records match your current filters. Try adjusting the search or filter criteria.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pageItems.map(r => (
              <div key={r.id} style={{
                background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(51,65,85,0.6)',
                borderRadius: 12, padding: '14px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 12, transition: 'border-color 0.2s'
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(167,139,250,0.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(51,65,85,0.6)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(236,72,153,0.15))',
                    border: '1px solid rgba(167,139,250,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Baby size={18} color="#a78bfa" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 3 }}>
                      {r.patient_name || 'Anonymous'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>ID: {r.patient_id}</span>
                      <span style={{ fontSize: 11, color: '#475569' }}>·</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>GA: {gaLabel(r.ga_days)}</span>
                      <span style={{ fontSize: 11, color: '#475569' }}>·</span>
                      <span style={{ fontSize: 11, color: '#475569' }}>
                        <Calendar size={10} style={{ display: 'inline', marginRight: 3 }} />
                        {formatDate(r.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <EfwBadge efw={r.efw_grams} />
                  <button
                    type="button"
                    onClick={() => regenPdf(r)}
                    disabled={regenLoading === r.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: 'linear-gradient(135deg, rgba(14,165,233,0.15), rgba(99,102,241,0.15))',
                      border: '1px solid rgba(56,189,248,0.35)', color: '#38bdf8',
                      opacity: regenLoading === r.id ? 0.6 : 1
                    }}
                  >
                    {regenLoading === r.id
                      ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                      : <><Download size={12} /> Re-open PDF</>
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 14px', borderRadius: 8, background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(51,65,85,0.6)', color: page === 1 ? '#334155' : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: page === 1 ? 'default' : 'pointer' }}>
              <ChevronLeft size={13} /> Previous
            </button>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Page {page} of {totalPages} · {filtered.length} results
            </span>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 14px', borderRadius: 8, background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(51,65,85,0.6)', color: page === totalPages ? '#334155' : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: page === totalPages ? 'default' : 'pointer' }}>
              Next <ChevronRight size={13} />
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
