'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Tenant { id: string; nombre: string }
type Rol = 'gerencia' | 'admin' | 'mecanico' | 'dueno' | 'freelancer' | 'asesor_comercial'

interface SeccionDef { key: string; label: string; descripcion: string; defaultOrden: number; soloGerencia?: boolean }
interface GrupoDef { key: string; label: string; secciones: SeccionDef[] }
interface PermisoRow { tenant_id: string; rol: Rol; seccion: string; habilitado: boolean; orden: number }

const GRUPOS_ADMIN: GrupoDef[] = [
  {
    key: 'serv-tec',
    label: 'Serv Tec & Rep',
    secciones: [
      { key: 'servicio_tecnico', label: 'Servicio Técnico',  descripcion: 'Órdenes de trabajo',              defaultOrden: 10 },
      { key: 'repuestos',        label: 'Repuestos',         descripcion: 'Ventas y catálogo de repuestos',  defaultOrden: 20 },
      { key: 'inventario',       label: 'Inventario',        descripcion: 'Movimientos y compras de stock',  defaultOrden: 30 },
      { key: 'caja',             label: 'Caja',               descripcion: 'Entradas y salidas de dinero de Serv. Téc. y Repuestos', defaultOrden: 35 },
      { key: 'clientes',         label: 'Clientes',          descripcion: 'Base de datos de clientes',       defaultOrden: 40 },
      { key: 'motos',            label: 'Motos',             descripcion: 'Base de datos de motos',          defaultOrden: 50 },
      { key: 'config_servicio',  label: 'Config Serv. Téc.', descripcion: 'Configuración y catálogos UMA',  defaultOrden: 85, soloGerencia: true },
    ],
  },
  {
    key: 'ventas',
    label: 'Ventas',
    secciones: [
      { key: 'ventas',        label: 'Seguimiento Ventas', descripcion: 'Seguimiento de clientes y ventas de motos', defaultOrden: 55 },
      { key: 'config_ventas', label: 'Config Ventas',      descripcion: 'Catálogos administrables de Seguimiento Ventas', defaultOrden: 56, soloGerencia: true },
    ],
  },
  {
    key: 'mensajes',
    label: 'Mensajes',
    secciones: [
      { key: 'mensajes_bandeja',    label: 'Bandeja',         descripcion: 'Bandeja de mensajes entrantes',      defaultOrden: 100 },
      { key: 'mensajes_conexion',   label: 'Conexión Meta',   descripcion: 'Configuración WhatsApp / Meta',      defaultOrden: 110, soloGerencia: true },
      { key: 'mensajes_plantillas', label: 'Plantillas',      descripcion: 'Plantillas de respuesta',            defaultOrden: 120 },
      { key: 'mensajes_flujos',     label: 'Flujos',          descripcion: 'Flujos de automatización',           defaultOrden: 130 },
    ],
  },
  {
    key: 'comentarios',
    label: 'Comentarios',
    secciones: [
      { key: 'comentarios', label: 'Publicaciones', descripcion: 'Comentarios de redes sociales', defaultOrden: 200 },
    ],
  },
]

const STANDALONE_ADMIN: SeccionDef[] = [
  { key: 'reportes',  label: 'Reportes',  descripcion: 'Reportes y estadísticas',  defaultOrden: 60 },
  { key: 'auditoria', label: 'Auditoría', descripcion: 'Log de cambios y acciones', defaultOrden: 70 },
  { key: 'mi_equipo', label: 'Mi equipo', descripcion: 'Gestión del equipo y permisos', defaultOrden: 80, soloGerencia: true },
]

const SECCIONES_ADMIN: SeccionDef[] = [
  ...GRUPOS_ADMIN.flatMap(g => g.secciones),
  ...STANDALONE_ADMIN,
]

const SECCIONES_MECANICO: SeccionDef[] = [
  { key: 'servicio_tecnico', label: 'Inicio / Mis órdenes', descripcion: 'Ver sus órdenes del día',      defaultOrden: 10 },
  { key: 'recepcion',        label: 'Recepcionar moto',     descripcion: 'Crear nueva orden de entrada',  defaultOrden: 20 },
]

const SECCIONES_FREELANCER: SeccionDef[] = [
  { key: 'ventas',                     label: 'Seguimiento Ventas',         descripcion: 'Pipeline, Resumen y Actividades (acotado a sus clientes)', defaultOrden: 55 },
  { key: 'dashboard_ventas_vehiculos', label: 'Dashboard Ventas Vehículos', descripcion: 'Solo sus propios clientes',                                defaultOrden: 7  },
  { key: 'lista_motos',                label: 'Lista de Motos',             descripcion: 'Lista de precios imprimible',                              defaultOrden: 57 },
]

const SECCIONES_POR_ROL: Record<Rol, SeccionDef[]> = {
  gerencia:   SECCIONES_ADMIN,
  admin:      SECCIONES_ADMIN,
  dueno:      SECCIONES_ADMIN,
  mecanico:   SECCIONES_MECANICO,
  freelancer: SECCIONES_FREELANCER,
  asesor_comercial: SECCIONES_ADMIN,
}

const ROL_TABS: { value: Rol; label: string; color: string }[] = [
  { value: 'gerencia',   label: 'Gerencia',       color: 'bg-green-600'  },
  { value: 'dueno',      label: 'Dueño',          color: 'bg-emerald-600' },
  { value: 'admin',      label: 'Administración', color: 'bg-amber-500'  },
  { value: 'mecanico',   label: 'Profesional',    color: 'bg-blue-600'   },
  { value: 'freelancer', label: 'Freelancer',     color: 'bg-purple-600' },
  { value: 'asesor_comercial', label: 'Asesor Comercial', color: 'bg-pink-600' },
]

export default function PermisosPage() {
  const supabase = createClient()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState('')
  const [selectedRol, setSelectedRol] = useState<Rol>('admin')
  const [permisos, setPermisos] = useState<Map<string, { habilitado: boolean; orden: number }>>(new Map())
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => {
    supabase.from('tenants').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => {
      const ts = (data ?? []) as Tenant[]
      setTenants(ts)
      if (ts.length > 0) setSelectedTenant(ts[0].id)
    })
  }, [])

  const cargarPermisos = useCallback(async () => {
    if (!selectedTenant) return
    const { data } = await supabase
      .from('permisos_roles')
      .select('seccion, habilitado, orden')
      .eq('tenant_id', selectedTenant)
      .eq('rol', selectedRol)

    const map = new Map<string, { habilitado: boolean; orden: number }>()
    // Defaults: todo habilitado, orden por defecto
    for (const s of SECCIONES_POR_ROL[selectedRol]) {
      map.set(s.key, { habilitado: true, orden: s.defaultOrden })
    }
    for (const row of (data ?? []) as { seccion: string; habilitado: boolean; orden: number }[]) {
      map.set(row.seccion, { habilitado: row.habilitado, orden: row.orden ?? 0 })
    }
    setPermisos(map)
  }, [selectedTenant, selectedRol])

  useEffect(() => { cargarPermisos() }, [cargarPermisos])

  const toggle = (seccion: string) => {
    setPermisos((prev) => {
      const next = new Map(prev)
      const actual = prev.get(seccion) ?? { habilitado: true, orden: 0 }
      next.set(seccion, { ...actual, habilitado: !actual.habilitado })
      return next
    })
  }

  const toggleGrupo = (secciones: SeccionDef[]) => {
    const todosOn = secciones.every(s => {
      const p = permisos.get(s.key)
      return p === undefined ? true : p.habilitado
    })
    const nuevoValor = !todosOn
    setPermisos((prev) => {
      const next = new Map(prev)
      for (const s of secciones) {
        const actual = prev.get(s.key) ?? { habilitado: true, orden: s.defaultOrden }
        next.set(s.key, { ...actual, habilitado: nuevoValor })
      }
      return next
    })
  }

  const mover = (seccion: string, dir: 'up' | 'down') => {
    const sorted = seccionesOrdenadas()
    const idx = sorted.findIndex((s) => s.key === seccion)
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === sorted.length - 1) return
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    const swapped = [...sorted]
    ;[swapped[idx], swapped[swapIdx]] = [swapped[swapIdx], swapped[idx]]
    setPermisos((prev) => {
      const next = new Map(prev)
      swapped.forEach((s, i) => {
        const actual = prev.get(s.key) ?? { habilitado: true, orden: 0 }
        next.set(s.key, { ...actual, orden: (i + 1) * 10 })
      })
      return next
    })
  }

  const seccionesOrdenadas = () => {
    return [...SECCIONES_POR_ROL[selectedRol]].sort((a, b) => {
      const oa = (permisos.get(a.key)?.orden || a.defaultOrden)
      const ob = (permisos.get(b.key)?.orden || b.defaultOrden)
      return oa - ob
    })
  }

  const guardar = async () => {
    if (!selectedTenant) return
    setSaving(true)
    try {
      const rows: PermisoRow[] = []
      for (const [seccion, p] of permisos.entries()) {
        rows.push({ tenant_id: selectedTenant, rol: selectedRol, seccion, habilitado: p.habilitado, orden: p.orden })
      }
      await supabase.from('permisos_roles').upsert(rows, { onConflict: 'tenant_id,rol,seccion' })
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const secciones = seccionesOrdenadas()

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Permisos y secciones por rol</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configura qué secciones ve cada rol y en qué orden aparecen en el menú.
        </p>
      </div>

      {/* Selector empresa */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Empresa</label>
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>

        {/* Selector rol */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Rol a configurar</label>
          <div className="flex gap-2">
            {ROL_TABS.map((r) => (
              <button
                key={r.value}
                onClick={() => setSelectedRol(r.value)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  selectedRol === r.value ? `${r.color} text-white` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Secciones */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-gray-50">
          <p className="text-sm font-semibold text-gray-700">
            Paneles para <span className="text-gray-900">{ROL_TABS.find(r => r.value === selectedRol)?.label}</span>
          </p>
        </div>

        {selectedRol !== 'mecanico' && selectedRol !== 'freelancer' ? (
          <>
            {GRUPOS_ADMIN.map((grupo) => {
              const secsGrupo = grupo.secciones.filter(s => selectedRol === 'gerencia' || !s.soloGerencia)
              if (secsGrupo.length === 0) return null
              const grupoOn = secsGrupo.every(s => {
                const p = permisos.get(s.key)
                return p === undefined ? true : p.habilitado
              })
              return (
                <div key={grupo.key}>
                  <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50/60 border-t border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{grupo.label}</span>
                    <button
                      onClick={() => toggleGrupo(secsGrupo)}
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${grupoOn ? 'bg-purple-600' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${grupoOn ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {secsGrupo.map((s) => {
                    const p = permisos.get(s.key) ?? { habilitado: true, orden: s.defaultOrden }
                    return (
                      <div key={s.key} className={`flex items-center gap-3 px-5 py-3.5 border-t border-gray-50 ${!p.habilitado ? 'opacity-50' : ''}`}>
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${p.habilitado ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                            {s.label}
                            {s.soloGerencia && <span className="ml-2 text-xs text-gray-300 font-normal">· solo gerencia</span>}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{s.descripcion}</p>
                        </div>
                        <button
                          onClick={() => toggle(s.key)}
                          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${p.habilitado ? 'bg-purple-600' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${p.habilitado ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {/* Standalone */}
            {(() => {
              const standaloneVisible = STANDALONE_ADMIN.filter(s => selectedRol === 'gerencia' || !s.soloGerencia)
              if (standaloneVisible.length === 0) return null
              return (
                <div>
                  <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50/60 border-t border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">General</span>
                    <button
                      onClick={() => toggleGrupo(standaloneVisible)}
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${standaloneVisible.every(s => { const p = permisos.get(s.key); return p === undefined ? true : p.habilitado }) ? 'bg-purple-600' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${standaloneVisible.every(s => { const p = permisos.get(s.key); return p === undefined ? true : p.habilitado }) ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {standaloneVisible.map((s) => {
                    const p = permisos.get(s.key) ?? { habilitado: true, orden: s.defaultOrden }
                    return (
                      <div key={s.key} className={`flex items-center gap-3 px-5 py-3.5 border-t border-gray-50 ${!p.habilitado ? 'opacity-50' : ''}`}>
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${p.habilitado ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                            {s.label}
                            {s.soloGerencia && <span className="ml-2 text-xs text-gray-300 font-normal">· solo gerencia</span>}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{s.descripcion}</p>
                        </div>
                        <button
                          onClick={() => toggle(s.key)}
                          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${p.habilitado ? 'bg-purple-600' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${p.habilitado ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </>
        ) : (
          /* Mecanico: lista plana con reorden */
          <div className="divide-y divide-gray-50">
            {secciones.map((s, idx) => {
              const p = permisos.get(s.key) ?? { habilitado: true, orden: s.defaultOrden }
              return (
                <div key={s.key} className={`flex items-center gap-3 px-5 py-3.5 ${!p.habilitado ? 'opacity-50' : ''}`}>
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button onClick={() => mover(s.key, 'up')} disabled={idx === 0}
                      className="w-5 h-5 flex items-center justify-center text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 rounded hover:bg-gray-100">▲</button>
                    <button onClick={() => mover(s.key, 'down')} disabled={idx === secciones.length - 1}
                      className="w-5 h-5 flex items-center justify-center text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 rounded hover:bg-gray-100">▼</button>
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${p.habilitado ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{s.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.descripcion}</p>
                  </div>
                  <button
                    onClick={() => toggle(s.key)}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${p.habilitado ? 'bg-purple-600' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${p.habilitado ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Guardar */}
      <div className="flex items-center gap-3">
        <button
          onClick={guardar}
          disabled={saving}
          className="px-6 py-2.5 bg-purple-700 text-white rounded-xl text-sm font-semibold hover:bg-purple-800 disabled:bg-purple-300 transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {savedMsg && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">Nota</p>
        <p>Los cambios de orden y visibilidad aplican inmediatamente al próximo inicio de sesión. Control Total siempre tiene acceso completo.</p>
      </div>
    </div>
  )
}
