'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/ventas/pipeline'

interface Entidad { id: string; nombre: string; activa: boolean }
interface MotoCat { id: string; referencia: string; precio: number; costo_documentos: number; costo_prenda: number; activa: boolean }
interface TipoRecordatorio { id: string; tipo: string; activo: boolean; dias_umbral: number }
interface Plantilla { id: string; nombre: string; asunto: string; cuerpo_html: string; activa: boolean }

const TIPO_LABEL: Record<string, string> = {
  credito_sin_iniciar: 'Estudio de crédito sin iniciar',
  entrega_moto_pendiente: 'Entrega de moto pendiente',
  cliente_sin_movimiento: 'Cliente sin movimiento',
}

function ToggleSwitch({ activo, onChange }: { activo: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${activo ? 'bg-green-500' : 'bg-gray-300'}`}>
      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${activo ? 'translate-x-4' : ''}`} />
    </button>
  )
}

export default function ConfigVentasPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [entidades, setEntidades]     = useState<Entidad[]>([])
  const [nuevaEntidad, setNuevaEntidad] = useState('')
  const [motos, setMotos]             = useState<MotoCat[]>([])
  const [tipos, setTipos]             = useState<TipoRecordatorio[]>([])
  const [plantillas, setPlantillas]   = useState<Plantilla[]>([])
  const [nuevaPlantilla, setNuevaPlantilla] = useState({ nombre: '', asunto: '', cuerpo_html: '' })
  const [loading, setLoading]         = useState(true)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    const [{ data: ent }, { data: mot }, { data: tip }, { data: plant }] = await Promise.all([
      supabase.from('entidades_financieras').select('id, nombre, activa').eq('tenant_id', profile.tenant_id).order('orden'),
      supabase.from('motos_catalogo').select('id, referencia, precio, costo_documentos, costo_prenda, activa').eq('tenant_id', profile.tenant_id).order('orden'),
      supabase.from('tipos_recordatorio_automatico').select('id, tipo, activo, dias_umbral').eq('tenant_id', profile.tenant_id),
      supabase.from('plantillas_correo').select('id, nombre, asunto, cuerpo_html, activa').eq('tenant_id', profile.tenant_id),
    ])
    setEntidades((ent ?? []) as Entidad[])
    setMotos((mot ?? []) as MotoCat[])
    setTipos((tip ?? []) as TipoRecordatorio[])
    setPlantillas((plant ?? []) as Plantilla[])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  // Garantiza que existan filas para los 3 tipos automáticos (con activo=true por defecto)
  useEffect(() => {
    if (!profile?.tenant_id || loading) return
    const faltantes = (Object.keys(TIPO_LABEL) as (keyof typeof TIPO_LABEL)[]).filter(t => !tipos.some(x => x.tipo === t))
    if (faltantes.length === 0) return
    Promise.all(faltantes.map(tipo =>
      supabase.from('tipos_recordatorio_automatico').insert({ tenant_id: profile.tenant_id, tipo, activo: true, dias_umbral: 7 })
    )).then(cargar)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id, loading])

  async function agregarEntidad() {
    if (!nuevaEntidad.trim() || !profile?.tenant_id) return
    await supabase.from('entidades_financieras').insert({ tenant_id: profile.tenant_id, nombre: nuevaEntidad.trim() })
    setNuevaEntidad('')
    cargar()
  }
  async function toggleEntidad(id: string, activa: boolean) {
    await supabase.from('entidades_financieras').update({ activa: !activa }).eq('id', id)
    setEntidades(p => p.map(e => e.id === id ? { ...e, activa: !activa } : e))
  }
  async function eliminarEntidad(id: string) {
    if (!confirm('¿Eliminar esta entidad?')) return
    await supabase.from('entidades_financieras').delete().eq('id', id)
    cargar()
  }

  async function actualizarMoto(id: string, campo: 'precio' | 'costo_documentos' | 'costo_prenda', valor: string) {
    const num = parseFloat(valor) || 0
    await supabase.from('motos_catalogo').update({ [campo]: num }).eq('id', id)
    setMotos(p => p.map(m => m.id === id ? { ...m, [campo]: num } : m))
  }
  async function toggleMoto(id: string, activa: boolean) {
    await supabase.from('motos_catalogo').update({ activa: !activa }).eq('id', id)
    setMotos(p => p.map(m => m.id === id ? { ...m, activa: !activa } : m))
  }

  async function toggleTipo(id: string, activo: boolean) {
    await supabase.from('tipos_recordatorio_automatico').update({ activo: !activo }).eq('id', id)
    setTipos(p => p.map(t => t.id === id ? { ...t, activo: !activo } : t))
  }
  async function actualizarUmbral(id: string, dias: string) {
    const num = parseInt(dias) || 1
    await supabase.from('tipos_recordatorio_automatico').update({ dias_umbral: num }).eq('id', id)
    setTipos(p => p.map(t => t.id === id ? { ...t, dias_umbral: num } : t))
  }

  async function crearPlantilla() {
    if (!nuevaPlantilla.nombre.trim() || !nuevaPlantilla.asunto.trim() || !nuevaPlantilla.cuerpo_html.trim() || !profile?.tenant_id) return
    await supabase.from('plantillas_correo').insert({ tenant_id: profile.tenant_id, ...nuevaPlantilla, created_by: profile.id })
    setNuevaPlantilla({ nombre: '', asunto: '', cuerpo_html: '' })
    cargar()
  }
  async function togglePlantilla(id: string, activa: boolean) {
    await supabase.from('plantillas_correo').update({ activa: !activa }).eq('id', id)
    setPlantillas(p => p.map(pl => pl.id === id ? { ...pl, activa: !activa } : pl))
  }
  async function eliminarPlantilla(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return
    await supabase.from('plantillas_correo').delete().eq('id', id)
    cargar()
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Cargando...</div>

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Config Ventas</h1>
        <p className="text-sm text-gray-500">Catálogos y reglas de Seguimiento Ventas (solo Gerencia)</p>
      </div>

      {/* Entidades financieras */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-bold text-gray-900 mb-3">Entidades financieras</h2>
        <div className="space-y-2 mb-3">
          {entidades.map(e => (
            <div key={e.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${!e.activa ? 'opacity-60' : 'border-gray-200'}`}>
              <span className="flex-1 text-sm font-medium text-gray-800">{e.nombre}</span>
              <ToggleSwitch activo={e.activa} onChange={() => toggleEntidad(e.id, e.activa)} />
              <button onClick={() => eliminarEntidad(e.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={nuevaEntidad} onChange={e => setNuevaEntidad(e.target.value)} placeholder="ej: Bancolombia"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={agregarEntidad} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">+ Agregar</button>
        </div>
      </section>

      {/* Catálogo de motos */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-bold text-gray-900 mb-1">Catálogo de motos</h2>
        <p className="text-xs text-gray-400 mb-3">Precio base, documentos (SOAT + matrícula + impuestos) y costo con prenda</p>
        <div className="space-y-2 overflow-x-auto">
          {motos.map(m => (
            <div key={m.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${!m.activa ? 'opacity-60' : 'border-gray-200'}`}>
              <span className="flex-1 text-sm font-medium text-gray-800 min-w-[160px]">{m.referencia}</span>
              <div>
                <label className="text-xs text-gray-400 block">Precio</label>
                <input type="number" defaultValue={m.precio} onBlur={e => actualizarMoto(m.id, 'precio', e.target.value)}
                  className="w-28 border border-gray-200 rounded px-1.5 py-1 text-xs" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">Documentos</label>
                <input type="number" defaultValue={m.costo_documentos} onBlur={e => actualizarMoto(m.id, 'costo_documentos', e.target.value)}
                  className="w-24 border border-gray-200 rounded px-1.5 py-1 text-xs" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">Prenda</label>
                <input type="number" defaultValue={m.costo_prenda} onBlur={e => actualizarMoto(m.id, 'costo_prenda', e.target.value)}
                  className="w-24 border border-gray-200 rounded px-1.5 py-1 text-xs" />
              </div>
              <span className="text-xs text-emerald-700 font-semibold min-w-[90px]">{formatCOP(m.precio + m.costo_documentos)}</span>
              <ToggleSwitch activo={m.activa} onChange={() => toggleMoto(m.id, m.activa)} />
            </div>
          ))}
          {motos.length === 0 && (
            <p className="text-sm text-gray-400">
              Sin motos en el catálogo. Corre <code className="bg-gray-100 px-1 rounded">seed_motos_catalogo.sql</code> en Supabase para cargar la lista inicial.
            </p>
          )}
        </div>
      </section>

      {/* Tipos de recordatorio automático */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-bold text-gray-900 mb-1">Recordatorios automáticos</h2>
        <p className="text-xs text-gray-400 mb-3">Se generan solos para clientes en Seguimiento Ventas que cumplan la condición</p>
        <div className="space-y-2">
          {tipos.map(t => (
            <div key={t.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${!t.activo ? 'opacity-60' : 'border-gray-200'}`}>
              <span className="flex-1 text-sm font-medium text-gray-800">{TIPO_LABEL[t.tipo] ?? t.tipo}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">después de</span>
                <input type="number" defaultValue={t.dias_umbral} onBlur={e => actualizarUmbral(t.id, e.target.value)}
                  className="w-14 border border-gray-200 rounded px-1.5 py-1 text-xs text-center" />
                <span className="text-xs text-gray-400">días</span>
              </div>
              <ToggleSwitch activo={t.activo} onChange={() => toggleTipo(t.id, t.activo)} />
            </div>
          ))}
        </div>
      </section>

      {/* Plantillas de correo */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-bold text-gray-900 mb-1">Plantillas de correo</h2>
        <p className="text-xs text-gray-400 mb-3">Cualquier rol puede usarlas para enviar correo a un cliente. Variable disponible: {'{{nombre_cliente}}'}</p>
        <div className="space-y-2 mb-3">
          {plantillas.map(p => (
            <div key={p.id} className={`rounded-lg border px-3 py-2 ${!p.activa ? 'opacity-60' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-semibold text-gray-800">{p.nombre}</span>
                <ToggleSwitch activo={p.activa} onChange={() => togglePlantilla(p.id, p.activa)} />
                <button onClick={() => eliminarPlantilla(p.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Asunto: {p.asunto}</p>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold text-gray-700">Nueva plantilla</p>
          <input value={nuevaPlantilla.nombre} onChange={e => setNuevaPlantilla(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre interno"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={nuevaPlantilla.asunto} onChange={e => setNuevaPlantilla(p => ({ ...p, asunto: e.target.value }))} placeholder="Asunto del correo"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <textarea value={nuevaPlantilla.cuerpo_html} onChange={e => setNuevaPlantilla(p => ({ ...p, cuerpo_html: e.target.value }))}
            placeholder="Cuerpo del correo (HTML simple). ej: Hola {{nombre_cliente}}, ..." rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          <button onClick={crearPlantilla} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
            + Crear plantilla
          </button>
        </div>
      </section>
    </div>
  )
}
