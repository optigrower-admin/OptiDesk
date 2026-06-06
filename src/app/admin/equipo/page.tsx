'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { clearPermisosCache } from '@/hooks/usePermisos'

type Tab = 'integrantes' | 'secciones'
type Rol = 'gerencia' | 'admin' | 'mecanico'

interface UsuarioEquipo {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
}

interface SeccionDef { key: string; label: string; defaultOrden: number }
interface PermisoLocal { habilitado: boolean; orden: number }

const ROL_LABEL: Record<Rol, string> = {
  gerencia: 'Gerencia',
  admin:    'Administrador Área',
  mecanico: 'Profesional',
}
const ROL_COLOR: Record<Rol, string> = {
  gerencia: 'bg-green-100 text-green-700 border border-green-200',
  admin:    'bg-amber-100 text-amber-700 border border-amber-200',
  mecanico: 'bg-blue-100 text-blue-700 border border-blue-200',
}

// Secciones del panel admin (aplica a gerencia y admin)
const SECCIONES_ADMIN: SeccionDef[] = [
  { key: 'servicio_tecnico', label: 'Servicio Técnico', defaultOrden: 10 },
  { key: 'repuestos',        label: 'Repuestos',        defaultOrden: 20 },
  { key: 'inventario',       label: 'Inventario',       defaultOrden: 30 },
  { key: 'clientes',         label: 'Clientes',         defaultOrden: 40 },
  { key: 'motos',            label: 'Motos',            defaultOrden: 50 },
  { key: 'reportes',         label: 'Reportes',         defaultOrden: 60 },
  { key: 'auditoria',        label: 'Auditoría',        defaultOrden: 70 },
]
// Secciones del panel mecánico
const SECCIONES_MECANICO: SeccionDef[] = [
  { key: 'servicio_tecnico', label: 'Inicio / Mis órdenes', defaultOrden: 10 },
  { key: 'recepcion',        label: 'Recepcionar moto',     defaultOrden: 20 },
]

const SECCIONES_POR_ROL: Record<Rol, SeccionDef[]> = {
  gerencia: SECCIONES_ADMIN,
  admin:    SECCIONES_ADMIN,
  mecanico: SECCIONES_MECANICO,
}

const ROLES_ORDEN: Rol[] = ['gerencia', 'admin', 'mecanico']

export default function EquipoPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('integrantes')
  const [usuarios, setUsuarios] = useState<UsuarioEquipo[]>([])
  const [loading, setLoading] = useState(true)

  // Permisos por rol: Map<rol, Map<seccion, PermisoLocal>>
  const permisosRef = useRef<Map<Rol, Map<string, PermisoLocal>>>(new Map())
  const [permisosPorRol, setPermisosPorRol] = useState<Map<Rol, Map<string, PermisoLocal>>>(new Map())
  const [loadedRoles, setLoadedRoles] = useState<Set<Rol>>(new Set())

  // Expandido en tab secciones
  const [expandidoRol, setExpandidoRol] = useState<Rol | null>('admin')

  // Editar rol (integrantes)
  const [editandoRolId, setEditandoRolId] = useState<string | null>(null)
  const [nuevoRol, setNuevoRol] = useState<Rol>('mecanico')
  const [savingRol, setSavingRol] = useState(false)

  // Reset password
  const [resetState, setResetState] = useState<Record<string, 'loading' | 'ok' | 'error'>>({})

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const { data } = await supabase
      .from('usuarios')
      .select('id, nombre, email, rol, activo')
      .eq('tenant_id', profile.tenant_id)
      .neq('id', profile.id)
      .order('nombre')
    setUsuarios((data as unknown as UsuarioEquipo[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id, profile?.id])

  useEffect(() => { cargar() }, [cargar])

  const cargarPermisosRol = useCallback(async (rol: Rol) => {
    if (!profile?.tenant_id || loadedRoles.has(rol)) return
    const { data } = await supabase
      .from('permisos_roles')
      .select('seccion, habilitado, orden')
      .eq('tenant_id', profile.tenant_id)
      .eq('rol', rol)

    const map = new Map<string, PermisoLocal>()
    for (const row of (data ?? []) as { seccion: string; habilitado: boolean; orden: number }[]) {
      map.set(row.seccion, { habilitado: row.habilitado, orden: row.orden ?? 0 })
    }
    permisosRef.current.set(rol, map)
    setPermisosPorRol(new Map(permisosRef.current))
    setLoadedRoles((prev) => new Set([...prev, rol]))
  }, [profile?.tenant_id, loadedRoles])

  // Cargar permisos de todos los roles al abrir tab secciones
  useEffect(() => {
    if (tab === 'secciones') {
      ROLES_ORDEN.forEach((r) => cargarPermisosRol(r))
    }
  }, [tab, cargarPermisosRol])

  const getPermiso = (rol: Rol, seccion: string): PermisoLocal => {
    const mapa = permisosPorRol.get(rol)
    if (!mapa) return { habilitado: true, orden: 0 }
    const val = mapa.get(seccion)
    return val ?? { habilitado: true, orden: 0 }
  }

  const seccionesOrdenadas = (rol: Rol): SeccionDef[] => {
    const secs = SECCIONES_POR_ROL[rol]
    return [...secs].sort((a, b) => {
      const oa = getPermiso(rol, a.key).orden || a.defaultOrden
      const ob = getPermiso(rol, b.key).orden || b.defaultOrden
      return oa - ob
    })
  }

  // Toggle habilitado
  const toggleSeccion = async (rol: Rol, seccion: string) => {
    if (!profile?.tenant_id) return
    const actual = getPermiso(rol, seccion)
    const nuevoValor = !actual.habilitado

    await supabase.from('permisos_roles').upsert(
      { tenant_id: profile.tenant_id, rol, seccion, habilitado: nuevoValor, orden: actual.orden || SECCIONES_POR_ROL[rol].find(s => s.key === seccion)?.defaultOrden || 0 },
      { onConflict: 'tenant_id,rol,seccion' }
    )
    const mapa = new Map(permisosRef.current.get(rol) ?? [])
    mapa.set(seccion, { ...actual, habilitado: nuevoValor })
    permisosRef.current.set(rol, mapa)
    setPermisosPorRol(new Map(permisosRef.current))
    clearPermisosCache(profile.tenant_id, rol)
  }

  // Reordenar arriba/abajo
  const moverSeccion = async (rol: Rol, seccion: string, dir: 'up' | 'down') => {
    if (!profile?.tenant_id) return
    const sorted = seccionesOrdenadas(rol)
    const idx = sorted.findIndex((s) => s.key === seccion)
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === sorted.length - 1) return

    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    const swapped = [...sorted]
    ;[swapped[idx], swapped[swapIdx]] = [swapped[swapIdx], swapped[idx]]

    const updates = swapped.map((s, i) => ({
      tenant_id: profile.tenant_id,
      rol,
      seccion: s.key,
      habilitado: getPermiso(rol, s.key).habilitado,
      orden: (i + 1) * 10,
    }))

    await supabase.from('permisos_roles').upsert(updates, { onConflict: 'tenant_id,rol,seccion' })

    const mapa = new Map(permisosRef.current.get(rol) ?? [])
    for (const u of updates) mapa.set(u.seccion, { habilitado: u.habilitado, orden: u.orden })
    permisosRef.current.set(rol, mapa)
    setPermisosPorRol(new Map(permisosRef.current))
    clearPermisosCache(profile.tenant_id, rol)
  }

  // Toggle activo
  const toggleActivo = async (u: UsuarioEquipo) => {
    await supabase.from('usuarios').update({ activo: !u.activo }).eq('id', u.id)
    setUsuarios((prev) => prev.map((x) => x.id === u.id ? { ...x, activo: !u.activo } : x))
  }

  // Cambiar rol
  const guardarRol = async (id: string) => {
    setSavingRol(true)
    await supabase.from('usuarios').update({ rol: nuevoRol }).eq('id', id)
    setUsuarios((prev) => prev.map((x) => x.id === id ? { ...x, rol: nuevoRol } : x))
    setEditandoRolId(null)
    setSavingRol(false)
  }

  // Reset password
  const enviarReset = async (u: UsuarioEquipo) => {
    setResetState((p) => ({ ...p, [u.id]: 'loading' }))
    const { error } = await supabase.auth.resetPasswordForEmail(u.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetState((p) => ({ ...p, [u.id]: error ? 'error' : 'ok' }))
    setTimeout(() => setResetState((p) => { const n = { ...p }; delete n[u.id]; return n }), 3000)
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi equipo</h1>
        <p className="text-sm text-gray-500">{usuarios.length} integrantes en tu empresa</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 w-fit">
        {([
          { value: 'integrantes', label: 'Integrantes' },
          { value: 'secciones',   label: 'Secciones por rol' },
        ] as { value: Tab; label: string }[]).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: INTEGRANTES ── */}
      {tab === 'integrantes' && (
        <div className="space-y-2">
          {loading ? (
            [1,2,3].map((i) => <div key={i} className="bg-white rounded-xl h-16 animate-pulse border border-gray-100" />)
          ) : usuarios.length === 0 ? (
            <p className="text-center py-10 text-gray-400 text-sm">No hay integrantes registrados.</p>
          ) : (
            usuarios.map((u) => {
              const editando = editandoRolId === u.id
              const rst = resetState[u.id]
              return (
                <div key={u.id} className={`bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex items-center gap-3 ${!u.activo ? 'opacity-60' : ''}`}>
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 flex-shrink-0">
                    {u.nombre[0]?.toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{u.nombre}</p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  </div>

                  {/* Rol: badge o selector inline */}
                  {editando ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <select
                        value={nuevoRol}
                        onChange={(e) => setNuevoRol(e.target.value as Rol)}
                        className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        autoFocus
                      >
                        {ROLES_ORDEN.map((r) => (
                          <option key={r} value={r}>{ROL_LABEL[r]}</option>
                        ))}
                      </select>
                      <button onClick={() => guardarRol(u.id)} disabled={savingRol}
                        className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-2.5 py-1.5 rounded-lg font-medium">
                        {savingRol ? '...' : 'OK'}
                      </button>
                      <button onClick={() => setEditandoRolId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1.5">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditandoRolId(u.id); setNuevoRol(u.rol) }}
                      title="Clic para cambiar rol"
                      className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 hover:opacity-75 transition-opacity ${ROL_COLOR[u.rol]}`}
                    >
                      {ROL_LABEL[u.rol]}
                    </button>
                  )}

                  {/* Reset password */}
                  <button
                    onClick={() => enviarReset(u)}
                    disabled={rst === 'loading'}
                    title="Enviar correo de recuperación de contraseña"
                    className={`flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                      rst === 'ok'      ? 'bg-green-50 border-green-300 text-green-700' :
                      rst === 'error'   ? 'bg-red-50 border-red-200 text-red-600' :
                      rst === 'loading' ? 'border-gray-200 text-gray-400' :
                      'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                    }`}
                  >
                    {rst === 'ok' ? '✓ Enviado' : rst === 'error' ? '✗ Error' : rst === 'loading' ? '...' : '🔑 Contraseña'}
                  </button>

                  {/* Toggle activo */}
                  <button
                    onClick={() => toggleActivo(u)}
                    title={u.activo ? 'Desactivar' : 'Activar'}
                    className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${u.activo ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${u.activo ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── TAB: SECCIONES POR ROL ── */}
      {tab === 'secciones' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Activa o desactiva secciones para cada rol. Usa ↑↓ para cambiar el orden en que aparecen en el menú.
            Los cambios aplican a todos los usuarios con ese rol en tu empresa.
          </p>

          {ROLES_ORDEN.map((rol) => {
            const abierto = expandidoRol === rol
            const conteo = usuarios.filter((u) => u.rol === rol).length
            const secciones = seccionesOrdenadas(rol)

            return (
              <div key={rol} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                {/* Header rol */}
                <button
                  onClick={() => setExpandidoRol(abierto ? null : rol)}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROL_COLOR[rol]}`}>
                      {ROL_LABEL[rol]}
                    </span>
                    <span className="text-xs text-gray-400">{conteo} usuario{conteo !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{secciones.length} secciones</span>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${abierto ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Secciones */}
                {abierto && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {secciones.map((s, idx) => {
                      const p = getPermiso(rol, s.key)
                      return (
                        <div key={s.key} className={`flex items-center gap-3 px-4 py-3 ${!p.habilitado ? 'opacity-50' : ''}`}>
                          {/* Reorder buttons */}
                          <div className="flex flex-col gap-0.5 flex-shrink-0">
                            <button
                              onClick={() => moverSeccion(rol, s.key, 'up')}
                              disabled={idx === 0}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed rounded hover:bg-gray-100 transition-colors"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moverSeccion(rol, s.key, 'down')}
                              disabled={idx === secciones.length - 1}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed rounded hover:bg-gray-100 transition-colors"
                            >
                              ▼
                            </button>
                          </div>

                          {/* Label */}
                          <p className={`flex-1 text-sm font-medium ${p.habilitado ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                            {s.label}
                          </p>

                          {/* Toggle */}
                          <button
                            onClick={() => toggleSeccion(rol, s.key)}
                            className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${p.habilitado ? 'bg-blue-500' : 'bg-gray-300'}`}
                          >
                            <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${p.habilitado ? 'translate-x-4' : ''}`} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
