'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { tablasPorModulo } from '@/lib/sqlConsole/whitelist'

const ROLES = ['mecanico', 'admin', 'gerencia', 'control_total', 'dueno', 'freelancer'] as const

type PermisoFila = {
  id: string
  usuario_id: string | null
  rol: string
  puede_acceder: boolean
  tablas_permitidas: string[]
  puede_exportar: boolean
  limite_filas_preview: number
}
type Usuario = { id: string; nombre: string; rol: string }

const MODULOS = tablasPorModulo()

export default function PermisosConsultasSQLPage() {
  const { profile, loading: cargandoAuth } = useAuth()
  const [permisos, setPermisos] = useState<PermisoFila[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<{ usuario_id: string | null; rol: string } | null>(null)
  const [form, setForm] = useState<{ puede_acceder: boolean; tablas_permitidas: string[]; puede_exportar: boolean; limite_filas_preview: number }>({
    puede_acceder: false, tablas_permitidas: [], puede_exportar: true, limite_filas_preview: 500,
  })
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)

  const esGerencia = profile?.rol === 'gerencia' || profile?.rol === 'control_total'

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/sql-console/permisos')
    const j = await r.json()
    setPermisos(j.permisos ?? [])
    setUsuarios(j.usuarios ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { if (esGerencia) cargar() }, [esGerencia, cargar])

  const filaPara = (usuario_id: string | null, rol: string) =>
    permisos.find(p => p.usuario_id === usuario_id && (usuario_id ? true : p.rol === rol))

  const abrirEditor = (usuario_id: string | null, rol: string) => {
    const existente = filaPara(usuario_id, rol)
    setEditando({ usuario_id, rol })
    setErrorGuardar(null)
    setForm({
      puede_acceder: existente?.puede_acceder ?? false,
      tablas_permitidas: existente?.tablas_permitidas ?? [],
      puede_exportar: existente?.puede_exportar ?? true,
      limite_filas_preview: existente?.limite_filas_preview ?? 500,
    })
  }

  const guardar = async () => {
    if (!editando) return
    setGuardando(true)
    setErrorGuardar(null)
    try {
      const r = await fetch('/api/admin/sql-console/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: editando.usuario_id, rol: editando.rol, ...form }),
      })
      const j = await r.json()
      if (!r.ok) { setErrorGuardar(j.error ?? 'No se pudo guardar'); return }
      setEditando(null)
      cargar()
    } catch {
      setErrorGuardar('No se pudo conectar con el servidor')
    } finally {
      setGuardando(false)
    }
  }

  const aplicarAtajo = (atajo: 'total' | 'sin_exportar' | 'sin_acceso') => {
    if (atajo === 'total') setForm({ puede_acceder: true, tablas_permitidas: [], puede_exportar: true, limite_filas_preview: 500 })
    if (atajo === 'sin_exportar') setForm({ puede_acceder: true, tablas_permitidas: [], puede_exportar: false, limite_filas_preview: 500 })
    if (atajo === 'sin_acceso') setForm({ puede_acceder: false, tablas_permitidas: [], puede_exportar: false, limite_filas_preview: 500 })
  }

  if (cargandoAuth) return null
  if (!esGerencia) {
    return <div className="p-6 text-sm text-gray-500">Esta sección es solo para Gerencia.</div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Permisos · Consultas SQL</h1>
        <p className="text-sm text-gray-500 mt-1">Define por rol (o por usuario puntual) quién puede entrar al editor SQL, qué tablas puede consultar y si puede exportar.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900 text-sm">Por rol (aplica a todos los usuarios de ese rol, salvo excepción)</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2">Rol</th>
                <th className="text-left px-4 py-2">Acceso</th>
                <th className="text-left px-4 py-2">Tablas</th>
                <th className="text-left px-4 py-2">Exportar</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ROLES.map(rol => {
                const fila = filaPara(null, rol)
                return (
                  <tr key={rol}>
                    <td className="px-4 py-2 text-gray-700 capitalize">{rol.replace('_', ' ')}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${fila?.puede_acceder ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {fila?.puede_acceder ? 'Habilitado' : 'Sin acceso'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {!fila?.puede_acceder ? '—' : fila.tablas_permitidas.length === 0 ? 'Todas' : `${fila.tablas_permitidas.length} tabla(s)`}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{fila?.puede_acceder ? (fila.puede_exportar ? 'Sí' : 'No') : '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => abrirEditor(null, rol)} className="text-xs text-blue-700 font-semibold hover:text-blue-900">Editar</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900 text-sm">Excepciones por usuario</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Usuario</th>
              <th className="text-left px-4 py-2">Rol</th>
              <th className="text-left px-4 py-2">Acceso</th>
              <th className="text-right px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {usuarios.map(u => {
              const fila = filaPara(u.id, u.rol)
              if (!fila) return null
              return (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-gray-700">{u.nombre}</td>
                  <td className="px-4 py-2 text-gray-500 capitalize">{u.rol.replace('_', ' ')}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${fila.puede_acceder ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {fila.puede_acceder ? 'Habilitado' : 'Sin acceso'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => abrirEditor(u.id, u.rol)} className="text-xs text-blue-700 font-semibold hover:text-blue-900">Editar</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t bg-gray-50">
          <select
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            defaultValue=""
            onChange={e => {
              const u = usuarios.find(x => x.id === e.target.value)
              if (u) abrirEditor(u.id, u.rol)
              e.target.value = ''
            }}
          >
            <option value="" disabled>+ Agregar excepción para un usuario...</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>)}
          </select>
        </div>
      </div>

      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-gray-900">
              {editando.usuario_id ? `Excepción: ${usuarios.find(u => u.id === editando.usuario_id)?.nombre}` : `Rol: ${editando.rol}`}
            </h3>

            {errorGuardar && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{errorGuardar}</div>
            )}

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Atajos rápidos</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => aplicarAtajo('total')} className="text-xs px-2.5 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg font-medium hover:bg-green-100">
                  ✓ Acceso total
                </button>
                <button type="button" onClick={() => aplicarAtajo('sin_exportar')} className="text-xs px-2.5 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-medium hover:bg-amber-100">
                  Solo consultar (sin exportar)
                </button>
                <button type="button" onClick={() => aplicarAtajo('sin_acceso')} className="text-xs px-2.5 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg font-medium hover:bg-gray-100">
                  ✕ Sin acceso
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.puede_acceder} onChange={e => setForm(f => ({ ...f, puede_acceder: e.target.checked }))} />
              Puede acceder a Consultas SQL
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.puede_exportar} onChange={e => setForm(f => ({ ...f, puede_exportar: e.target.checked }))} />
              Puede exportar resultados
            </label>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Límite de filas en preview</label>
              <input
                type="number"
                value={form.limite_filas_preview}
                onChange={e => setForm(f => ({ ...f, limite_filas_preview: Number(e.target.value) || 500 }))}
                className="w-32 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tablas permitidas <span className="text-xs text-gray-400 font-normal">(ninguna marcada = todas)</span>
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-100 rounded-lg p-2">
                {Object.entries(MODULOS).map(([modulo, tablas]) => (
                  <div key={modulo}>
                    <p className="text-[11px] font-semibold text-gray-500 mb-1">{modulo}</p>
                    <div className="flex flex-wrap gap-1">
                      {tablas.map(t => (
                        <button
                          key={t.tabla}
                          type="button"
                          onClick={() => setForm(f => ({
                            ...f,
                            tablas_permitidas: f.tablas_permitidas.includes(t.tabla)
                              ? f.tablas_permitidas.filter(x => x !== t.tabla)
                              : [...f.tablas_permitidas, t.tabla],
                          }))}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            form.tablas_permitidas.includes(t.tabla) ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {t.tabla}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEditando(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
