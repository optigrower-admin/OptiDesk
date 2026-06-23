'use client'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'

export interface DonutDatum { label: string; value: number; color: string }

export function DonutChart({ data, formatValor }: { data: DonutDatum[]; formatValor?: (v: number) => string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) {
    return <div className="h-56 flex items-center justify-center text-sm text-gray-400">Sin órdenes en este período</div>
  }
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="w-44 h-44 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={45} outerRadius={75} paddingAngle={2}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v) => formatValor ? formatValor(Number(v)) : String(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 w-full space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span className="text-gray-700 truncate">{d.label}</span>
            </div>
            <span className="text-gray-500 font-medium flex-shrink-0 ml-2">
              {d.value} · {((d.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface RankingDatum { label: string; value: number; sub?: string }

export function BarRankingChart({ data, color = '#2563eb', formatValor }: { data: RankingDatum[]; color?: string; formatValor?: (v: number) => string }) {
  if (data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
  }
  const height = Math.max(data.length * 36, 60)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12, fill: '#374151' }} />
        <Tooltip formatter={(v) => formatValor ? formatValor(Number(v)) : String(v)} />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export interface SerieDatum { fecha: string; actual: number; anterior?: number }

export function TimeSeriesChart({ data, formatValor, labelActual = 'Actual', labelAnterior = 'Período anterior' }: {
  data: SerieDatum[]; formatValor?: (v: number) => string; labelActual?: string; labelAnterior?: string
}) {
  if (data.length === 0) {
    return <div className="h-56 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} width={48} />
        <Tooltip formatter={(v) => formatValor ? formatValor(Number(v)) : String(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="actual" name={labelActual} stroke="#2563eb" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="anterior" name={labelAnterior} stroke="#cbd5e1" strokeWidth={2} dot={false} strokeDasharray="4 4" />
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface FunnelDatum { label: string; value: number; color?: string }

export function FunnelBars({ data }: { data: FunnelDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-32 flex-shrink-0 truncate">{d.label}</span>
          <div className="flex-1 h-6 bg-gray-50 rounded-md overflow-hidden">
            <div
              className="h-full rounded-md flex items-center justify-end px-2 text-xs font-semibold text-white transition-all"
              style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 8 : 0)}%`, background: d.color ?? '#2563eb' }}
            >
              {d.value > 0 ? d.value : ''}
            </div>
          </div>
          {d.value === 0 && <span className="text-xs text-gray-400 w-6">0</span>}
        </div>
      ))}
    </div>
  )
}
