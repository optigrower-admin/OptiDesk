'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { PeriodoFilter } from '@/components/dashboard/PeriodoFilter'
import { calcularRango, type PeriodoPreset } from '@/lib/dashboard/periodos'
import {
  TABLAS_DISPONIBLES, AGREGACION_LABEL, calcularTodasLasMedidas, evaluarVariables, formatValor,
  type Medida, type VariableCalculada, type Agregacion, type FormatoNumero, type FiltroMedida, type OperadorFiltro,
} from '@/lib/dashboard/medidas'

const ROLES_EDITA = ['gerencia', 'dueno', 'control_total', 'admin']

const FORMATOS: { valor: FormatoNumero; label: string }[] = [
  { valor: 'moneda', label: 'Moneda (COP)' },
  { valor: 'entero', label: 'Número entero' },
  { valor: 'decimal', label: 'Decimal' },
  { valor: 'porcentaje', label: 'Porcentaje (%)' },
]
const AGREGACIONES: Agregacion[] = ['suma', 'promedio', 'conteo', 'conteo_distinto', 'minimo', 'maximo']
const OPERADORES: { valor: OperadorFiltro; label: string }[] = [
  { valor: 'eq', label: '=' }, { valor: 'neq', label: '≠' },
  { valor: 'gt', label: '>' }, { valor: 'gte', label: '≥' },
  { valor: 'lt', label: '<' }, { valor: 'lte', label: '≤' },
  { valor: 'in', label: 'está en (a, b, c)' },
]

const MEDIDA_VACIA = {
  nombre: '', descripcion: '', tabla: 'clientes', campo: '', agregacion: 'suma' as Agregacion,
  campo_fecha: '', filtros: [] as FiltroMedida[], formato: 'moneda' as FormatoNumero, decimales: 0,
}
const VARIABLE_VACIA = { nombre: '', descripcion: '', formula: '', formato: 'moneda' as FormatoNumero, decimales: 0 }

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
  function abrirNuevaMedida() { setFormMedida({ ...MEDIDA_VACIA }); setEditandoMedidaId('__nueva__') }
  function abrirEditarMedida(m: Medida) {
    setFormMedida({
      nombre: m.nombre, descripcion: m.descripcion ?? '', tabla: m.tabla, campo: m.campo ?? '',
      agregacion: m.agregacion, campo_fecha: m.campo_fecha ?? '', filtros: m.filtros ?? [],
      formato: m.formato, decimales: m.decimales,
    })
    setEditandoMedidaId(m.id)
  }
  async function guardarMedida() {
    if (!formMedida || !profile?.tenant_id || !formMedida.nombre.trim()) return
    setSavingMedida(true)
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        nombre: formMedida.nombre.trim(),
        descripcion: formMedida.descripcion.trim() || null,
        tabla: formMedida.tabla,
        campo: formMedida.agregacion === 'conteo' ? null : (formMedida.campo || null),
        agregacion: formMedida.agregacion,
        campo_fecha: formMedida.campo_fecha || null,
        filtros: formMedida.filtros,
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
  function agregarFiltro() {
    if (!formMedida) return
    const camposFiltro = TABLAS_DISPONIBLES[formMedida.tabla]?.camposFiltro ?? []
    setFormMedida({ ...formMedida, filtros: [...formMedida.filtros, { campo: camposFiltro[0]?.valor ?? '', operador: 'eq', valor: '' }] })
  }
  function actualizarFiltro(idx: number, cambios: Partial<FiltroMedida>) {
    if (!formMedida) return
    setFormMedida({ ...formMedida, filtros: formMedida.filtros.map((f, i) => i === idx ? { ...f, ...cambios } : f) })
  }
  function quitarFiltro(idx: number) {
    if (!formMedida) return
    setFormMedida({ ...formMedida, filtros: formMedida.filtros.filter((_, i) => i !== idx) })
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
          La base del constructor de dashboard: define qué se calcula (Medidas) y combínalo en fórmulas (Variables calculadas).
          Más adelante estas medidas y variables se van a poder graficar y filtrar entre sí, como en Power BI.
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
                  {AGREGACION_LABEL[m.agregacion]} de {TABLAS_DISPONIBLES[m.tabla]?.label ?? m.tabla}
                  {m.campo ? ` · ${m.campo}` : ''}{m.filtros?.length ? ` · ${m.filtros.length} filtro(s)` : ''}
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
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Nombre</label>
                <input value={formMedida.nombre} onChange={e => setFormMedida({ ...formMedida, nombre: e.target.value })}
                  placeholder="Ej: Total vendido"
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Tabla</label>
                <select value={formMedida.tabla} onChange={e => setFormMedida({ ...formMedida, tabla: e.target.value, campo: '', campo_fecha: '', filtros: [] })}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {Object.entries(TABLAS_DISPONIBLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Agregación</label>
                <select value={formMedida.agregacion} onChange={e => setFormMedida({ ...formMedida, agregacion: e.target.value as Agregacion })}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {AGREGACIONES.map(a => <option key={a} value={a}>{AGREGACION_LABEL[a]}</option>)}
                </select>
              </div>
            </div>
            {formMedida.agregacion !== 'conteo' && (
              <div>
                <label className="text-xs text-gray-500">Campo</label>
                <select value={formMedida.campo} onChange={e => setFormMedida({ ...formMedida, campo: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Selecciona un campo...</option>
                  {(TABLAS_DISPONIBLES[formMedida.tabla]?.campos ?? []).map(c => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500">Filtrar por fecha usando</label>
              <select value={formMedida.campo_fecha} onChange={e => setFormMedida({ ...formMedida, campo_fecha: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sin filtro de fecha (todo el histórico)</option>
                {(TABLAS_DISPONIBLES[formMedida.tabla]?.camposFecha ?? []).map(c => <option key={c.valor} value={c.valor}>{c.label}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-500">Filtros adicionales</label>
                <button onClick={agregarFiltro} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">+ Agregar filtro</button>
              </div>
              {formMedida.filtros.map((f, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <select value={f.campo} onChange={e => actualizarFiltro(idx, { campo: e.target.value })}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                    {(TABLAS_DISPONIBLES[formMedida.tabla]?.camposFiltro ?? []).map(c => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                  </select>
                  <select value={f.operador} onChange={e => actualizarFiltro(idx, { operador: e.target.value as OperadorFiltro })}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                    {OPERADORES.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
                  </select>
                  <input value={f.valor} onChange={e => actualizarFiltro(idx, { valor: e.target.value })} placeholder="Valor"
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white" />
                  <button onClick={() => quitarFiltro(idx)} className="text-red-400 hover:text-red-600 p-0.5">✕</button>
                </div>
              ))}
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
          {puedeEditar && !formVariable && medidas.length > 0 && (
            <button onClick={abrirNuevaVariable} className="text-xs text-blue-700 font-semibold hover:text-blue-900">+ Nueva variable</button>
          )}
        </div>

        {medidas.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Crea al menos una medida primero.</p>}
        {medidas.length > 0 && variables.length === 0 && !formVariable && <p className="text-sm text-gray-400 text-center py-4">Sin variables creadas todavía.</p>}

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
              {nombresDisponibles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {nombresDisponibles.map(n => (
                    <button key={n} type="button"
                      onClick={() => setFormVariable({ ...formVariable, formula: formVariable.formula + `[${n}]` })}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-blue-300">
                      + {n}
                    </button>
                  ))}
                </div>
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
