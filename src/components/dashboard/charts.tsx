'use client'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend, LabelList,
} from 'recharts'

function formatCompact(v: number, money = false): string {
  const p = money ? '$' : ''
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${p}${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${p}${Math.round(v / 1_000)}K`
  return `${p}${Math.round(v)}`
}

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

export function BarRankingChart({
  data, dataAnterior, color = '#2563eb', formatValor,
}: {
  data: RankingDatum[]
  dataAnterior?: RankingDatum[]
  color?: string
  formatValor?: (v: number) => string
}) {
  if (data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
  }
  const fmt = (v: unknown) => formatValor ? formatValor(Number(v)) : String(v)
  const hasComp = !!dataAnterior
  const merged = data.map((d) => {
    const ant = dataAnterior?.find((a) => a.label === d.label)
    return { label: d.label, value: d.value, anterior: ant?.value ?? 0 }
  })
  const barSize = hasComp ? 11 : 15
  const rowH = hasComp ? 46 : 36
  const height = Math.max(merged.length * rowH, 60)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={merged} layout="vertical" margin={{ left: 8, right: 68, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12, fill: '#374151' }} />
        <Tooltip formatter={fmt} />
        {hasComp && (
          <Bar dataKey="anterior" name="Período ant." fill="#e5e7eb" radius={[0, 4, 4, 0]} barSize={barSize}>
            <LabelList
              dataKey="anterior"
              position="right"
              formatter={(v: unknown) => Number(v) > 0 ? fmt(v) : ''}
              style={{ fontSize: 10, fill: '#9ca3af' }}
            />
          </Bar>
        )}
        <Bar dataKey="value" name="Actual" fill={color} radius={[0, 6, 6, 0]} barSize={barSize}>
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: unknown) => Number(v) > 0 ? fmt(v) : ''}
            style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ParetoBarChart({
  data, color = '#16a34a', formatValor,
}: {
  data: RankingDatum[]
  color?: string
  formatValor?: (v: number) => string
}) {
  if (data.length === 0) {
    return <div className="h-56 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
  }
  const fmt = (v: unknown) => formatValor ? formatValor(Number(v)) : String(v)
  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 6)}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 20, bottom: 48 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#374151' }} interval={0} angle={-35} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
        <Tooltip formatter={fmt} />
        <Bar dataKey="value" name="Unidades" fill={color} radius={[6, 6, 0, 0]}>
          <LabelList
            dataKey="value"
            position="top"
            formatter={(v: unknown) => Number(v) > 0 ? fmt(v) : ''}
            style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export interface SerieDatum { fecha: string; actual: number; anterior?: number }

export function TimeSeriesChart({
  data, formatValor, labelActual = 'Actual', labelAnterior = 'Período anterior', isMoney = false,
}: {
  data: SerieDatum[]
  formatValor?: (v: number) => string
  labelActual?: string
  labelAnterior?: string
  isMoney?: boolean
}) {
  if (data.length === 0) {
    return <div className="h-56 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
  }
  const showLabels = data.length <= 18
  const fmt = (v: unknown) => formatValor ? formatValor(Number(v)) : String(v)
  const fmtAxis = (v: number) => formatCompact(v, isMoney)

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: showLabels ? 22 : 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} width={58} tickFormatter={fmtAxis} />
        <Tooltip formatter={fmt} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="actual" name={labelActual} stroke="#2563eb" strokeWidth={2} dot={showLabels ? { r: 3, fill: '#2563eb' } : false}>
          {showLabels && (
            <LabelList
              dataKey="actual"
              position="top"
              formatter={(v: unknown) => fmtAxis(Number(v))}
              style={{ fontSize: 10, fill: '#2563eb', fontWeight: 600 }}
            />
          )}
        </Line>
        <Line type="monotone" dataKey="anterior" name={labelAnterior} stroke="#cbd5e1" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface DualSerieDatum { fecha: string; serieA: number; serieB: number }

export function DualLineChart({
  data, labelA, labelB, colorA = '#2563eb', colorB = '#7c3aed',
}: {
  data: DualSerieDatum[]
  labelA: string
  labelB: string
  colorA?: string
  colorB?: string
}) {
  if (data.length === 0) {
    return <div className="h-56 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
  }
  const showLabels = data.length <= 18
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: showLabels ? 22 : 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} width={40} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="serieA" name={labelA} stroke={colorA} strokeWidth={2} dot={showLabels ? { r: 3, fill: colorA } : false}>
          {showLabels && <LabelList dataKey="serieA" position="top" style={{ fontSize: 10, fill: colorA, fontWeight: 600 }} />}
        </Line>
        <Line type="monotone" dataKey="serieB" name={labelB} stroke={colorB} strokeWidth={2} dot={showLabels ? { r: 3, fill: colorB } : false}>
          {showLabels && <LabelList dataKey="serieB" position="top" style={{ fontSize: 10, fill: colorB, fontWeight: 600 }} />}
        </Line>
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface FunnelDatum { label: string; value: number; color?: string }

export function FunnelBars({ data, dataAnterior }: { data: FunnelDatum[]; dataAnterior?: FunnelDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value), ...(dataAnterior ?? []).map((d) => d.value))
  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const ant = dataAnterior?.[i]
        const actW = d.value > 0 ? Math.max((d.value / max) * 100, 4) : 0
        const antW = ant && ant.value > 0 ? Math.max((ant.value / max) * 100, 4) : 0
        return (
          <div key={i}>
            <span className="text-xs font-medium text-gray-500 block mb-1">{d.label}</span>
            <div className="space-y-1">
              {/* Actual bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-6 bg-gray-50 rounded overflow-hidden">
                  <div
                    className="h-full rounded flex items-center justify-end px-2 text-xs font-semibold text-white"
                    style={{ width: `${actW}%`, background: d.color ?? '#2563eb', minWidth: d.value > 0 ? '2rem' : 0 }}
                  >
                    {d.value > 0 ? d.value : ''}
                  </div>
                </div>
                <span className="w-7 text-xs font-semibold text-gray-700 text-right flex-shrink-0">{d.value}</span>
              </div>
              {/* Previous period bar — gray, below */}
              {ant !== undefined && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden">
                    <div
                      className="h-full rounded flex items-center justify-end px-2 text-[10px] text-gray-400"
                      style={{ width: `${antW}%`, background: '#d1d5db', minWidth: ant.value > 0 ? '1.5rem' : 0 }}
                    >
                      {ant.value > 0 ? ant.value : ''}
                    </div>
                  </div>
                  <span className="w-7 text-[10px] text-gray-400 text-right flex-shrink-0">{ant.value}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const DIAS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export interface WeekdayDatum { actual: number; anterior: number }

export function WeekdayBarChart({
  data, color = '#2563eb', formatValor, isMoney = false,
}: {
  data: WeekdayDatum[]
  color?: string
  formatValor?: (v: number) => string
  isMoney?: boolean
}) {
  if (data.length === 0) return <div className="h-44 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
  const merged = DIAS_ES.map((dia, i) => ({ dia, actual: data[i]?.actual ?? 0, anterior: data[i]?.anterior ?? 0 }))
  const fmtAxis = (v: number) => formatCompact(v, isMoney)
  const fmt = (v: unknown) => formatValor ? formatValor(Number(v)) : formatCompact(Number(v), isMoney)
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={merged} margin={{ left: 0, right: 8, top: 20, bottom: 0 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} width={52} tickFormatter={fmtAxis} />
        <Tooltip formatter={fmt} />
        <Bar dataKey="anterior" name="Período ant." fill="#d1d5db" radius={[3, 3, 0, 0]} barSize={13}>
          <LabelList dataKey="anterior" position="top" formatter={(v: unknown) => Number(v) > 0 ? fmtAxis(Number(v)) : ''} style={{ fontSize: 9, fill: '#9ca3af' }} />
        </Bar>
        <Bar dataKey="actual" name="Actual" fill={color} radius={[3, 3, 0, 0]} barSize={13}>
          <LabelList dataKey="actual" position="top" formatter={(v: unknown) => Number(v) > 0 ? fmtAxis(Number(v)) : ''} style={{ fontSize: 9, fill: color, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
