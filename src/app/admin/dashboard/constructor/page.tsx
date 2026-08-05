'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { PeriodoFilter } from '@/components/dashboard/PeriodoFilter'
import { calcularRango, type PeriodoPreset } from '@/lib/dashboard/periodos'
import {
  TABLAS_DISPONIBLES, AGREGACION_LABEL, OPERADOR_TERMINO_LABEL, calcularTodasLasMedidas, evaluarVariables, formatValor,
  type Medida, type VariableCalculada, type Agregacion, type FormatoNumero, type FiltroMedida, type OperadorFiltro,
  type TerminoMedida, type OperadorTermino,
} from '@/lib/dashboard/medidas'

const ROLES_EDITA = ['gerencia', 'dueno', 'control_total', 'admin']

const FORMATOS: { valor: FormatoNumero; label: string }[] = [
  { valor: 'moneda', label: 'Moneda (COP)' },
  { valor: 'entero', label: 'Número entero' },
  { valor: 'decimal', label: 'Decimal' },
  { valor: 'porcentaje', label: 'Porcentaje (%)' },
]
const AGREGACIONES: Agregacion[] = ['suma', 'promedio', 'conteo', 'conteo_distinto', 'minimo', 'maximo']
const OPERADORES_TERMINO: OperadorTermino[] = ['+', '-', '*', '/']
const OPERADORES_FILTRO: { valor: OperadorFiltro; label: string }[] = [
  { valor: 'eq', label: '=' }, { valor: 'neq', label: '≠' },
  { valor: 'gt', label: '>' }, { valor: 'gte', label: '≥' },
  { valor: 'lt', label: '<' }, { valor: 'lte', label: '≤' },
  { valor: 'in', label: 'está en (a, b, c)' },
]
const PRIMERA_TABLA = Object.keys(TABLAS_DISPONIBLES)[0]

function terminoVacio(operador: OperadorTermino = '+'): TerminoMedida {
  return { tabla: PRIMERA_TABLA, campo: '', agregacion: 'suma', campo_fecha: '', filtros: [], operador }
}

const MEDIDA_VACIA = { nombre: '', descripcion: '', terminos: [terminoVacio()], formato: 'moneda' as FormatoNumero, decimales: 0 }
const VARIABLE_VACIA = { nombre: '', descripcion: '', formula: '', formato: 'moneda' as FormatoNumero, decimales: 0 }

function resumenTermino(t: TerminoMedida): string {
  const tabla = TABLAS_DISPONIBLES[t.tabla]?.label ?? t.tabla
  const campo = t.agregacion === 'conteo' ? '' : ` de ${t.campo || '(sin campo)'}`
  return `${AGREGACION_LABEL[t.agregacion]}${campo} en ${tabla}`
}

export default function ConstructorDashboardPage() {
  const supabase = createClient()
  const { profile } = useAuth()
  const puedeEditar = ROLES_EDITA.includes(profile?.rol ?? '')

  const [medidas, setMedidas] = useState<Medida[]>([])
  const [variables, setVariables] = useState<VariableCalculada[]>([])
  const [loading, setLoading] = useState(true)

  const [preset, setPreset] = useState<PeriodoPreset>('mes')
  const [desdeManual, setDesdeManual] = useState('')
  const [hastaManual, setHastaManual] = useState('')
  const rango = useMemo(() => calcularRango(preset, desdeManual, hastaManual), [preset, desdeManual, hastaManual])

  const [valoresMedidas, setValoresMedidas] = useState<Record<string, number>>({})
  const [calculando, setCalculando] = useState(false)

  const [formMedida, setFormMedida] = useState<typeof MEDIDA_VACIA | null>(null)
  const [editandoMedidaId, setEditandoMedidaId] = useState<string | null>(null)
  const [savingMedida, setSavingMedida] = useState(false)

  const [formVariable, setFormVariable] = useState<typeof VARIABLE_VACIA | null>(null)
  const [editandoVariableId, setEditandoVariableId] = useState<string | null>(null)
  const [savingVariable, setSavingVariable] = useState(false)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    const [{ data: m }, { data: v }] = await Promise.all([
      supabase.from('dashboard_medidas').select('*').eq('tenant_id', profile.tenant_id).order('nombre'),
      supabase.from('dashboard_variables').select('*').eq('tenant_id', profile.tenant_id).order('nombre'),
    ])
    setMedidas((m ?? []) as Medida[])
    setVariables((v ?? []) as VariableCalculada[])
    setLoading(false)
  }, [profile?.tenant_id, supabase])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!profile?.tenant_id || medidas.length === 0) { setValoresMedidas({}); return }
    let cancelado = false
    setCalculando(true)
    calcularTodasLasMedidas(supabase, profile.tenant_id, medidas, rango).then(v => {
      if (!cancelado) { setValoresMedidas(v); setCalculando(false) }
    })
    return () => { cancelado = true }
  }, [medidas, rango, profile?.tenant_id, supabase])

  const valoresVariables = useMemo(() => evaluarVariables(valoresMedidas, variables), [valoresMedidas, variables])

  // ── Medidas ──
  function abrirNuevaMedida() { setFormMedida({ ...MEDIDA_VACIA, terminos: [terminoVacio()] }); setEditandoMedidaId('__nueva__') }
  function abrirEditarMedida(m: Medida) {
    setFormMedida({
      nombre: m.nombre, descripcion: m.descripcion ?? '',
      terminos: m.terminos.length ? m.terminos : [terminoVacio()],
      formato: m.formato, decimales: m.decimales,
    })
    setEditandoMedidaId(m.id)
  }
  async function guardarMedida() {
    if (!formMedida || !profile?.tenant_id || !formMedida.nombre.trim()) return
    if (formMedida.terminos.some(t => t.agregacion !== 'conteo' && !t.campo)) {
      alert('Falta elegir el campo en alguno de los términos.'); return
    }
    setSavingMedida(true)
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        nombre: formMedida.nombre.trim(),
        descripcion: formMedida.descripcion.trim() || null,
        terminos: formMedida.terminos.map(t => ({ ...t, campo: t.agregacion === 'conteo' ? null : (t.campo || null), campo_fecha: t.campo_fecha || null })),
        formato: formMedida.formato,
        decimales: formMedida.decimales,
      }
      if (editandoMedidaId && editandoMedidaId !== '__nueva__') {
        const { error } = await supabase.from('dashboard_medidas').update(payload).eq('id', editandoMedidaId)
        if (error) { alert(`No se pudo guardar: ${error.message}`); return }
      } else {
        const { error } = await supabase.from('dashboard_medidas').insert(payload)
        if (error) { alert(`No se pudo crear: ${error.message}`); return }
      }
      setFormMedida(null); setEditandoMedidaId(null)
      await cargar()
    } finally {
      setSavingMedida(false)
    }
  }
  async function eliminarMedida(id: string) {
    if (!confirm('¿Eliminar esta medida? Las variables que la usen quedarán con error hasta que ajustes su fórmula.')) return
    await supabase.from('dashboard_medidas').delete().eq('id', id)
    await cargar()
  }

  function agregarTermino() {
    if (!formMedida) return
    setFormMedida({ ...formMedida, terminos: [...formMedida.terminos, terminoVacio('+')] })
  }
  function actualizarTermino(idx: number, cambios: Partial<TerminoMedida>) {
    if (!formMedida) return
    setFormMedida({ ...formMedida, terminos: formMedida.terminos.map((t, i) => i === idx ? { ...t, ...cambios } : t) })
  }
  function quitarTermino(idx: number) {
    if (!formMedida || formMedida.terminos.length <= 1) return
    setFormMedida({ ...formMedida, terminos: formMedida.terminos.filter((_, i) => i !== idx) })
  }
  function agregarFiltroTermino(idxTermino: number) {
    if (!formMedida) return
    const t = formMedida.terminos[idxTermino]
    const camposFiltro = TABLAS_DISPONIBLES[t.tabla]?.camposFiltro ?? []
    actualizarTermino(idxTermino, { filtros: [...t.filtros, { campo: camposFiltro[0]?.valor ?? '', operador: 'eq', valor: '' }] })
  }
  function actualizarFiltroTermino(idxTermino: number, idxFiltro: number, cambios: Partial<FiltroMedida>) {
    if (!formMedida) return
    const t = formMedida.terminos[idxTermino]
    actualizarTermino(idxTermino, { filtros: t.filtros.map((f, i) => i === idxFiltro ? { ...f, ...cambios } : f) })
  }
  function quitarFiltroTermino(idxTermino: number, idxFiltro: number) {
    if (!formMedida) return
    const t = formMedida.terminos[idxTermino]
    actualizarTermino(idxTermino, { filtros: t.filtros.filter((_, i) => i !== idxFiltro) })
  }

  // ── Variables ──
  function abrirNuevaVariable() { setFormVariable({ ...VARIABLE_VACIA }); setEditandoVariableId('__nueva__') }
  function abrirEditarVariable(v: VariableCalculada) {
    setFormVariable({ nombre: v.nombre, descripcion: v.descripcion ?? '', formula: v.formula, formato: v.formato, decimales: v.decimales })
    setEditandoVariableId(v.id)
  }
  async function guardarVariable() {
    if (!formVariable || !profile?.tenant_id || !formVariable.nombre.trim() || !formVariable.formula.trim()) return
    setSavingVariable(true)
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        nombre: formVariable.nombre.trim(),
        descripcion: formVariable.descripcion.trim() || null,
        formula: formVariable.formula.trim(),
        formato: formVariable.formato,
        decimales: formVariable.decimales,
      }
      if (editandoVariableId && editandoVariableId !== '__nueva__') {
        const { error } = await supabase.from('dashboard_variables').update(payload).eq('id', editandoVariableId)
        if (error) { alert(`No se pudo guardar: ${error.message}`); return }
      } else {
        const { error } = await supabase.from('dashboard_variables').insert(payload)
        if (error) { alert(`No se pudo crear: ${error.message}`); return }
      }
      setFormVariable(null); setEditandoVariableId(null)
      await cargar()
    } finally {
      setSavingVariable(false)
    }
  }
  async function eliminarVariable(id: string) {
    if (!confirm('¿Eliminar esta variable?')) return
    await supabase.from('dashboard_variables').delete().eq('id', id)
    await cargar()
  }

  const nombresDisponibles = [...medidas.map(m => m.nombre), ...variables.map(v => v.nombre)]

  if (loading) return <div className="p-6"><p className="text-sm text-gray-400 text-center py-8">Cargando...</p></div>

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Medidas y Variables</h1>
        <p className="text-sm text-gray-500 mt-1">
          La base del constructor de dashboard. Una <strong>Medida</strong> puede combinar varios campos con +, −, × y ÷
          (ej. Ganancia = Ventas − Costos). Las <strong>Variables calculadas</strong> combinan medidas (y otras variables)
          con fórmulas más avanzadas, incluyendo condicionales (SI). Más adelante esto se va a poder graficar y filtrar
          entre sí, como en Power BI.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Período de prueba</p>
        <PeriodoFilter preset={preset} desdeManual={desdeManual} hastaManual={hastaManual}
          onChangePreset={setPreset} onChangeDesdeManual={setDesdeManual} onChangeHastaManual={setHastaManual} />
        <p className="text-[11px] text-gray-400 mt-2">
          Del {new Date(rango.desdeISO).toLocaleDateString('es-CO')} al {new Date(rango.hastaISO).toLocaleDateString('es-CO')}
          {calculando && ' · calculando...'}
        </p>
      </div>

      {/* ── MEDIDAS ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Medidas</h2>
          {puedeEditar && !formMedida && (
            <button onClick={abrirNuevaMedida} className="text-xs text-blue-700 font-semibold hover:text-blue-900">+ Nueva medida</button>
          )}
        </div>

        {medidas.length === 0 && !formMedida && <p className="text-sm text-gray-400 text-center py-4">Sin medidas creadas todavía.</p>}

        <div className="space-y-2">
          {medidas.filter(m => editandoMedidaId !== m.id).map(m => (
            <div key={m.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">{m.nombre}</p>
                <p className="text-xs text-gray-400 truncate">
                  {m.terminos.map((t, i) => (i === 0 ? '' : ` ${t.operador} `) + resumenTermino(t)).join('')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-bold text-emerald-700">{formatValor(valoresMedidas[m.nombre] ?? 0, m.formato, m.decimales)}</span>
                {puedeEditar && (
                  <>
                    <button onClick={() => abrirEditarMedida(m)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">Editar</button>
                    <button onClick={() => eliminarMedida(m.id)} className="text-red-400 hover:text-red-600 p-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {formMedida && (
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Nombre</label>
                <input value={formMedida.nombre} onChange={e => setFormMedida({ ...formMedida, nombre: e.target.value })}
                  placeholder="Ej: Ganancia"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Formato</label>
                <select value={formMedida.formato} onChange={e => setFormMedida({ ...formMedida, formato: e.target.value as FormatoNumero })}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {FORMATOS.map(f => <option key={f.valor} value={f.valor}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <input value={formMedida.descripcion} onChange={e => setFormMedida({ ...formMedida, descripcion: e.target.value })}
              placeholder="Descripción (opcional)"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />

            <div className="space-y-2">
              {formMedida.terminos.map((t, idx) => (
                <div key={idx} className="bg-white border border-gray-200 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {idx === 0 ? (
                      <span className="text-xs font-semibold text-gray-400 w-20">Primero</span>
                    ) : (
                      <select value={t.operador} onChange={e => actualizarTermino(idx, { operador: e.target.value as OperadorTermino })}
                        className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1 w-20 bg-gray-50">
                        {OPERADORES_TERMINO.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    <select value={t.tabla} onChange={e => actualizarTermino(idx, { tabla: e.target.value, campo: '', campo_fecha: '', filtros: [] })}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                      {Object.entries(TABLAS_DISPONIBLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <select value={t.agregacion} onChange={e => actualizarTermino(idx, { agregacion: e.target.value as Agregacion })}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                      {AGREGACIONES.map(a => <option key={a} value={a}>{AGREGACION_LABEL[a]}</option>)}
                    </select>
                    {formMedida.terminos.length > 1 && (
                      <button onClick={() => quitarTermino(idx)} className="text-red-400 hover:text-red-600 p-0.5 flex-shrink-0">✕</button>
                    )}
                  </div>

                  {t.agregacion !== 'conteo' && (
                    <select value={t.campo ?? ''} onChange={e => actualizarTermino(idx, { campo: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                      <option value="">Selecciona un campo...</option>
                      {(TABLAS_DISPONIBLES[t.tabla]?.campos ?? []).map(c => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                    </select>
                  )}

                  <select value={t.campo_fecha ?? ''} onChange={e => actualizarTermino(idx, { campo_fecha: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                    <option value="">Sin filtro de fecha (todo el histórico)</option>
                    {(TABLAS_DISPONIBLES[t.tabla]?.camposFecha ?? []).map(c => <option key={c.valor} value={c.valor}>Filtrar período por: {c.label}</option>)}
                  </select>

                  <div className="space-y-1">
                    {t.filtros.map((f, fi) => (
                      <div key={fi} className="flex items-center gap-1">
                        <select value={f.campo} onChange={e => actualizarFiltroTermino(idx, fi, { campo: e.target.value })}
                          className="flex-1 border border-gray-200 rounded-lg px-1.5 py-0.5 text-[11px] bg-white">
                          {(TABLAS_DISPONIBLES[t.tabla]?.camposFiltro ?? []).map(c => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                        </select>
                        <select value={f.operador} onChange={e => actualizarFiltroTermino(idx, fi, { operador: e.target.value as OperadorFiltro })}
                          className="border border-gray-200 rounded-lg px-1.5 py-0.5 text-[11px] bg-white">
                          {OPERADORES_FILTRO.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
                        </select>
                        <input value={f.valor} onChange={e => actualizarFiltroTermino(idx, fi, { valor: e.target.value })} placeholder="Valor"
                          className="flex-1 border border-gray-200 rounded-lg px-1.5 py-0.5 text-[11px] bg-white" />
                        <button onClick={() => quitarFiltroTermino(idx, fi)} className="text-red-400 hover:text-red-600 px-0.5">✕</button>
                      </div>
                    ))}
                    <button onClick={() => agregarFiltroTermino(idx)} className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold">+ filtro</button>
                  </div>
                </div>
              ))}
              <button onClick={agregarTermino} className="text-xs text-blue-700 font-semibold hover:text-blue-900">
                + Combinar con otro campo ({OPERADORES_TERMINO.map(o => OPERADOR_TERMINO_LABEL[o]).join(' / ')})
              </button>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={guardarMedida} disabled={savingMedida || !formMedida.nombre.trim()}
                className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">
                {savingMedida ? 'Guardando...' : 'Guardar medida'}
              </button>
              <button onClick={() => { setFormMedida(null); setEditandoMedidaId(null) }}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* ── VARIABLES CALCULADAS ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Variables calculadas</h2>
          {puedeEditar && !formVariable && (
            <button onClick={abrirNuevaVariable} className="text-xs text-blue-700 font-semibold hover:text-blue-900">+ Nueva variable</button>
          )}
        </div>

        {variables.length === 0 && !formVariable && <p className="text-sm text-gray-400 text-center py-4">Sin variables creadas todavía. Úsalas para combinar medidas con condicionales (SI) — para sumar/restar/dividir campos simples, hazlo directo en la Medida.</p>}

        <div className="space-y-2">
          {variables.filter(v => editandoVariableId !== v.id).map(v => (
            <div key={v.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">{v.nombre}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{v.formula}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-bold text-emerald-700">{formatValor(valoresVariables[v.nombre] ?? null, v.formato, v.decimales)}</span>
                {puedeEditar && (
                  <>
                    <button onClick={() => abrirEditarVariable(v)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">Editar</button>
                    <button onClick={() => eliminarVariable(v.id)} className="text-red-400 hover:text-red-600 p-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {formVariable && (
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Nombre</label>
                <input value={formVariable.nombre} onChange={e => setFormVariable({ ...formVariable, nombre: e.target.value })}
                  placeholder="Ej: % cumplimiento"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Formato</label>
                <select value={formVariable.formato} onChange={e => setFormVariable({ ...formVariable, formato: e.target.value as FormatoNumero })}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {FORMATOS.map(f => <option key={f.valor} value={f.valor}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <input value={formVariable.descripcion} onChange={e => setFormVariable({ ...formVariable, descripcion: e.target.value })}
              placeholder="Descripción (opcional)"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div>
              <label className="text-xs text-gray-500">Fórmula</label>
              <textarea value={formVariable.formula} onChange={e => setFormVariable({ ...formVariable, formula: e.target.value })}
                placeholder="Ej: [Total vendido] - [Total pagado]  ·  SI([Total vendido] > 1000000, 1, 0)"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {nombresDisponibles.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {nombresDisponibles.map(n => (
                    <button key={n} type="button"
                      onClick={() => setFormVariable({ ...formVariable, formula: formVariable.formula + `[${n}]` })}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-blue-300">
                      + {n}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-amber-600 mt-1">Aún no tienes medidas ni variables para referenciar — crea una medida primero.</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1">Usa [Nombre] para referenciar una medida u otra variable. Operadores: + − * / ( ) &gt; &lt; &gt;= &lt;= == !=. Función: SI(condición, si_cumple, si_no).</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={guardarVariable} disabled={savingVariable || !formVariable.nombre.trim() || !formVariable.formula.trim()}
                className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">
                {savingVariable ? 'Guardando...' : 'Guardar variable'}
              </button>
              <button onClick={() => { setFormVariable(null); setEditandoVariableId(null) }}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
