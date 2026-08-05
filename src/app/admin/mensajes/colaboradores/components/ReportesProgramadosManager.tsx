'use client'
import { useState, useEffect, useCallback } from 'react'

interface ReporteProgramado {
  id: string
  tipo_reporte: 'pipeline' | 'servicio_tecnico'
  nombre: string
  asunto: string
  canal_correo: boolean
  canal_whatsapp: boolean
  hora_envio: string
  frecuencia: 'diario' | 'semanal' | 'mensual'
  dia_semana: number | null
  dia_mes: number | null
  periodo: 'hoy' | 'semana' | 'mes' | 'trimestre' | 'anio'
  modo_gerencia: 'general' | 'por_usuario'
  activo: boolean
}

interface Props {
  usuarioId: string
  tipoReporte: 'pipeline' | 'servicio_tecnico'
  titulo: string
  asuntoDefault: string
  esGerenciaDestino: boolean
  etiquetaPorUsuario: string // "Por asesor" o "Por mecánico"
}

const DIAS = [
  { v: 1, label: 'Lun' }, { v: 2, label: 'Mar' }, { v: 3, label: 'Mié' }, { v: 4, label: 'Jue' },
  { v: 5, label: 'Vie' }, { v: 6, label: 'Sáb' }, { v: 0, label: 'Dom' },
]
const PERIODOS: { v: ReporteProgramado['periodo']; label: string }[] = [
  { v: 'hoy', label: 'Hoy' }, { v: 'semana', label: 'Esta semana' }, { v: 'mes', label: 'Este mes' },
  { v: 'trimestre', label: 'Este trimestre' }, { v: 'anio', label: 'Este año' },
]
const FREC_LABEL: Record<string, string> = { diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual' }

function resumenEnvio(r: ReporteProgramado): string {
  let cuando = FREC_LABEL[r.frecuencia]
  if (r.frecuencia === 'semanal') cuando += ` (${DIAS.find(d => d.v === r.dia_semana)?.label ?? '—'})`
  if (r.frecuencia === 'mensual') cuando += ` (día ${r.dia_mes})`
  const canales = [r.canal_correo && '✉️', r.canal_whatsapp && '📱'].filter(Boolean).join(' ')
  return `${canales} · ${cuando} · ${r.hora_envio.slice(0, 5)} · ${PERIODOS.find(p => p.v === r.periodo)?.label}`
}

const inputCls = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400'

export default function ReportesProgramadosManager({ usuarioId, tipoReporte, titulo, asuntoDefault, esGerenciaDestino, etiquetaPorUsuario }: Props) {
  const [envios, setEnvios] = useState<ReporteProgramado[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ id: string; texto: string; ok: boolean } | null>(null)

  const [fNombre, setFNombre] = useState('')
  const [fAsunto, setFAsunto] = useState(asuntoDefault)
  const [fCorreo, setFCorreo] = useState(true)
  const [fWhatsapp, setFWhatsapp] = useState(false)
  const [fHora, setFHora] = useState('08:00')
  const [fFrecuencia, setFFrecuencia] = useState<ReporteProgramado['frecuencia']>('diario')
  const [fDiaSemana, setFDiaSemana] = useState(1)
  const [fDiaMes, setFDiaMes] = useState(1)
  const [fPeriodo, setFPeriodo] = useState<ReporteProgramado['periodo']>('hoy')
  const [fModo, setFModo] = useState<ReporteProgramado['modo_gerencia']>('general')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/mensajes/colaboradores/reportes?usuarioId=${usuarioId}`)
    const data = await res.json().catch(() => ({}))
    setEnvios((data.reportes ?? []) as ReporteProgramado[])
    setLoading(false)
  }, [usuarioId])

  useEffect(() => { cargar() }, [cargar])

  const enviosDeEsteReporte = envios.filter(r => r.tipo_reporte === tipoReporte)

  function resetForm() {
    setFNombre(''); setFAsunto(asuntoDefault); setFCorreo(true); setFWhatsapp(false)
    setFHora('08:00'); setFFrecuencia('diario'); setFDiaSemana(1); setFDiaMes(1)
    setFPeriodo('hoy'); setFModo('general')
    setEditandoId(null)
  }

  function abrirEdicion(r: ReporteProgramado) {
    setFNombre(r.nombre); setFAsunto(r.asunto); setFCorreo(r.canal_correo); setFWhatsapp(r.canal_whatsapp)
    setFHora(r.hora_envio.slice(0, 5)); setFFrecuencia(r.frecuencia)
    setFDiaSemana(r.dia_semana ?? 1); setFDiaMes(r.dia_mes ?? 1)
    setFPeriodo(r.periodo); setFModo(r.modo_gerencia)
    setEditandoId(r.id); setShowForm(true)
  }

  async function guardar() {
    if (!fAsunto.trim()) return
    if (!fCorreo && !fWhatsapp) { alert('Elige al menos un canal'); return }
    setGuardando(true)
    const body = {
      accion: editandoId ? 'editar' : 'crear',
      id: editandoId ?? undefined,
      usuarioId, tipoReporte,
      nombre: fNombre || 'Envío', asunto: fAsunto,
      canalCorreo: fCorreo, canalWhatsapp: fWhatsapp,
      horaEnvio: fHora, frecuencia: fFrecuencia, diaSemana: fDiaSemana, diaMes: fDiaMes,
      periodo: fPeriodo, modoGerencia: fModo,
    }
    const res = await fetch('/api/admin/mensajes/colaboradores/reportes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setGuardando(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Error al guardar'); return }
    resetForm(); setShowForm(false); cargar()
  }

  async function toggleActivo(r: ReporteProgramado) {
    await fetch('/api/admin/mensajes/colaboradores/reportes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'toggle', id: r.id, activo: !r.activo }),
    })
    cargar()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este envío programado?')) return
    await fetch('/api/admin/mensajes/colaboradores/reportes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'eliminar', id }),
    })
    cargar()
  }

  async function enviarAhora(id: string) {
    setEnviandoId(id)
    try {
      const res = await fetch('/api/admin/mensajes/colaboradores/reportes/enviar-ahora', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al enviar')
      setMensaje({ id, texto: data.aviso ? `Enviado (${data.aviso})` : 'Enviado ✓', ok: true })
    } catch (e) {
      setMensaje({ id, texto: e instanceof Error ? e.message : 'Error', ok: false })
    } finally {
      setEnviandoId(null)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  function previewUrl(periodo: string, modo: string) {
    return `/api/admin/mensajes/colaboradores/reportes/preview?usuarioId=${usuarioId}&tipoReporte=${tipoReporte}&periodo=${periodo}&modoGerencia=${modo}`
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-gray-700">{titulo}</p>
        <div className="flex items-center gap-2">
          <a href={previewUrl(fPeriodo, fModo)} target="_blank" rel="noopener noreferrer"
            className="text-[11px] px-2 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            👁️ Vista previa
          </a>
          <button onClick={() => { resetForm(); setShowForm(s => !s) }}
            className="text-[11px] px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100">
            + Agregar envío
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-[11px] text-gray-400">Cargando...</p>
      ) : enviosDeEsteReporte.length === 0 && !showForm ? (
        <p className="text-[11px] text-gray-400">Sin envíos programados todavía.</p>
      ) : (
        <div className="space-y-1">
          {enviosDeEsteReporte.map(r => (
            <div key={r.id} className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg ${r.activo ? 'bg-gray-50' : 'bg-gray-50 opacity-50'}`}>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-gray-700 truncate">{r.nombre}</p>
                <p className="text-[10px] text-gray-400 truncate">{resumenEnvio(r)}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <a href={previewUrl(r.periodo, r.modo_gerencia)} target="_blank" rel="noopener noreferrer" title="Vista previa" className="text-[11px] text-gray-400 hover:text-blue-600">👁️</a>
                <button onClick={() => enviarAhora(r.id)} disabled={enviandoId === r.id} title="Enviar ahora" className="text-[11px] text-gray-400 hover:text-purple-600 disabled:opacity-40">📤</button>
                <button onClick={() => abrirEdicion(r)} title="Editar" className="text-[11px] text-gray-400 hover:text-blue-600">✏️</button>
                <label className="inline-flex items-center cursor-pointer" title={r.activo ? 'Activo' : 'Inactivo'}>
                  <input type="checkbox" checked={r.activo} onChange={() => toggleActivo(r)} className="rounded" />
                </label>
                <button onClick={() => eliminar(r.id)} title="Eliminar" className="text-[11px] text-gray-400 hover:text-red-600">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {envios.some(r => mensaje?.id === r.id) && (
        <p className={`text-[11px] mt-1 ${mensaje!.ok ? 'text-green-600' : 'text-red-600'}`}>{mensaje!.texto}</p>
      )}

      {showForm && (
        <div className="mt-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Nombre (ej: Diario 8am)" value={fNombre} onChange={e => setFNombre(e.target.value)} className={inputCls} />
            <select value={fPeriodo} onChange={e => setFPeriodo(e.target.value as ReporteProgramado['periodo'])} className={inputCls}>
              {PERIODOS.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
          </div>
          <input placeholder="Asunto del correo" value={fAsunto} onChange={e => setFAsunto(e.target.value)} className={`w-full ${inputCls}`} />

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-[11px] cursor-pointer">
              <input type="checkbox" checked={fCorreo} onChange={() => setFCorreo(p => !p)} className="rounded" /> ✉️ Correo
            </label>
            <label className="flex items-center gap-1 text-[11px] cursor-pointer">
              <input type="checkbox" checked={fWhatsapp} onChange={() => setFWhatsapp(p => !p)} className="rounded" /> 📱 WhatsApp
            </label>
            <input type="time" value={fHora} onChange={e => setFHora(e.target.value)} className={inputCls} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(['diario', 'semanal', 'mensual'] as const).map(f => (
              <button key={f} type="button" onClick={() => setFFrecuencia(f)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${fFrecuencia === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {FREC_LABEL[f]}
              </button>
            ))}
            {fFrecuencia === 'semanal' && (
              <select value={fDiaSemana} onChange={e => setFDiaSemana(Number(e.target.value))} className={inputCls}>
                {DIAS.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            )}
            {fFrecuencia === 'mensual' && (
              <select value={fDiaMes} onChange={e => setFDiaMes(Number(e.target.value))} className={inputCls}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>Día {d}</option>)}
              </select>
            )}
          </div>

          {esGerenciaDestino && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">Ver:</span>
              <button type="button" onClick={() => setFModo('general')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${fModo === 'general' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>
                Total general
              </button>
              <button type="button" onClick={() => setFModo('por_usuario')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${fModo === 'por_usuario' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>
                {etiquetaPorUsuario}
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => { setShowForm(false); resetForm() }} className="flex-1 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-[11px] font-medium hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando} className="flex-1 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-[11px] font-semibold">
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : '+ Crear envío'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
