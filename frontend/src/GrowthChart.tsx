import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

// ── FMF equations for percentile curves ─────────────────────────────────────

// HC percentile curve at a given GA (weeks), for a target centile
function hcAtCentile(gaWeeks: number, centile: number): number {
  const z = centile === 50 ? 0 : centile === 10 ? -1.2816 : centile === 90 ? 1.2816 : centile === 5 ? -1.6449 : centile === 95 ? 1.6449 : 0
  const ga = Math.min(gaWeeks, 39.776)
  const meanLog = 1.3369692 + 0.0596493 * ga - 0.0007494 * ga * ga
  return Math.pow(10, meanLog + z * 0.01997) - 1
}

function acAtCentile(gaWeeks: number, centile: number): number {
  const z = centile === 50 ? 0 : centile === 10 ? -1.2816 : centile === 90 ? 1.2816 : centile === 5 ? -1.6449 : centile === 95 ? 1.6449 : 0
  const meanLog = 1.3257977 + 0.0552337 * gaWeeks - 0.0006146021 * gaWeeks * gaWeeks
  return Math.pow(10, meanLog + z * 0.02947) - 9
}

function flAtCentile(gaWeeks: number, centile: number): number {
  const z = centile === 50 ? 0 : centile === 10 ? -1.2816 : centile === 90 ? 1.2816 : centile === 5 ? -1.6449 : centile === 95 ? 1.6449 : 0
  const sqrtMean = 0.4263429 * gaWeeks - 1.1132444 - 0.0045992 * gaWeeks * gaWeeks
  return Math.pow(sqrtMean + z * 0.1852, 2)
}

function efwAtCentile(gaWeeks: number, centile: number): number {
  const z = centile === 50 ? 0 : centile === 10 ? -1.2816 : centile === 90 ? 1.2816 : centile === 5 ? -1.6449 : centile === 95 ? 1.6449 : 0
  const gaDays = gaWeeks * 7
  const e = gaDays - 199
  const meanLog = 3.0893 + 0.00835 * e - 0.00002965 * e * e - 0.00000006062 * e * e * e
  const sdLog = 0.02464 + 0.00000005639669 * gaDays
  return Math.pow(10, meanLog + z * sdLog)
}

// ── Curve generator ───────────────────────────────────────────────────────────
type MeasureType = 'HC' | 'AC' | 'FL' | 'EFW'

const fnMap: Record<MeasureType, (ga: number, c: number) => number> = {
  HC: hcAtCentile,
  AC: acAtCentile,
  FL: flAtCentile,
  EFW: efwAtCentile,
}

const unitMap: Record<MeasureType, string> = {
  HC: 'mm', AC: 'mm', FL: 'mm', EFW: 'g'
}

const gaRange = Array.from({ length: 25 }, (_, i) => 16 + i) // 16–40 weeks

interface GrowthChartProps {
  measure: MeasureType
  patientGaWeeks?: number
  patientValue?: number
}

export default function GrowthChart({ measure, patientGaWeeks, patientValue }: GrowthChartProps) {
  const fn = fnMap[measure]
  const unit = unitMap[measure]

  const labels = gaRange.map(w => `${w}w`)

  const p5  = gaRange.map(w => fn(w, 5))
  const p10 = gaRange.map(w => fn(w, 10))
  const p50 = gaRange.map(w => fn(w, 50))
  const p90 = gaRange.map(w => fn(w, 90))
  const p95 = gaRange.map(w => fn(w, 95))

  // Patient point
  const patientData = gaRange.map(w => {
    if (patientGaWeeks && patientValue && Math.abs(w - patientGaWeeks) < 0.6) return patientValue
    return null
  })

  const data = {
    labels,
    datasets: [
      {
        label: '95th',
        data: p95,
        borderColor: 'rgba(239,68,68,0.4)',
        borderWidth: 1,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        tension: 0.4,
      },
      {
        label: '90th',
        data: p90,
        borderColor: 'rgba(245,158,11,0.5)',
        borderWidth: 1,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: '+1',
        backgroundColor: 'rgba(245,158,11,0.04)',
        tension: 0.4,
      },
      {
        label: '50th',
        data: p50,
        borderColor: 'rgba(14,165,233,0.9)',
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.4,
      },
      {
        label: '10th',
        data: p10,
        borderColor: 'rgba(245,158,11,0.5)',
        borderWidth: 1,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: '-1',
        backgroundColor: 'rgba(245,158,11,0.04)',
        tension: 0.4,
      },
      {
        label: '5th',
        data: p5,
        borderColor: 'rgba(239,68,68,0.4)',
        borderWidth: 1,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        tension: 0.4,
      },
      {
        label: 'Patient',
        data: patientData,
        borderColor: '#f1f5f9',
        backgroundColor: '#f1f5f9',
        pointRadius: 7,
        pointHoverRadius: 9,
        showLine: false,
        borderWidth: 0,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#94a3b8',
          font: { size: 10, family: 'Inter' },
          boxWidth: 20,
          padding: 10,
          filter: (item: any) => ['5th', '50th', '95th', 'Patient'].includes(item.text),
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,0.95)',
        titleColor: '#94a3b8',
        bodyColor: '#f1f5f9',
        borderColor: '#334155',
        borderWidth: 1,
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)} ${unit}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 10 },
        grid: { color: 'rgba(51,65,85,0.3)' },
      },
      y: {
        ticks: { color: '#64748b', font: { size: 10 } },
        grid: { color: 'rgba(51,65,85,0.3)' },
        title: {
          display: true,
          text: `${measure} (${unit})`,
          color: '#64748b',
          font: { size: 11 },
        },
      },
    },
  }

  return (
    <div style={{ height: 220 }}>
      <Line data={data} options={options} />
    </div>
  )
}
