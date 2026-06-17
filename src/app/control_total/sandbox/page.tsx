'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Tenant { id: string; nombre: string; sandbox_tenant_id: string | null }
interface UsuarioSandbox {
  id: string
  nombre: string
  email: string
  rol: string
  sandbox_tenant_id: string | null
}

export default function SandboxPage() {
  const supabase = createClient()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioSandbox[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const stagingUrl = 'https://optidesk-staging-optigrower-s-projects.vercel.app'

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tenants')
      .select('id, nombre, sandbox_tenant_id')
      .eq('activo', true)
      .eq('es_sandbox', false)
      .order('nombre')
    setTenants((data ?? []) as Tenant[])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const cargarUsuarios = useCallback(async (tenantId: string, sandboxId: string | null) => {
    const { data } = await supabase
      .from('usuarios')
      .select('id, nombre, email, rol, sandbox_tenant_id')
      .eq('tenant_id', tenantId)
      .neq('rol', 'control_total')
      .order('nombre')
    setUsuarios((data ?? []) as UsuarioSandbox[])
  }, [])

  const seleccionar = (t: Tenant) => {
    setSelectedTenant(t)
    setMsg(null)
    cargarUsuarios(t.id, t.sandbox_tenant_id)
  }

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const crearSandbox = async () => {
    if (!selectedTenant) return
    setWorking(true)
    try {
      const res = await fetch('/api/control_total/sandbox/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: selectedTenant.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      flash(true, 'Entorno de prueba creado.')
      await cargar()
      const updated = { ...selectedTenant, sandbox_tenant_id: json.sandbox_tenant_id }
      setSelectedTenant(updated)
      cargarUsuarios(updated.id, updated.sandbox_tenant_id)
    } catch (e: unknown) {
      flash(false, e instanceof Error ? e.message : 'Error')
    } finally {
      setWorking(false)
    }
  }

  const eliminarSandbox = async () => {
    if (!selectedTenant?.sandbox_tenant_id) return
    if (!confirm(`¿Eliminar TODOS los datos de prueba de "${selectedTenant.nombre}"? Esta acción no se puede deshacer.`)) return
    setWorking(true)
    try {
      const res = await fetch('/api/control_total/sandbox/eliminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox_tenant_id: selectedTenant.sandbox_tenant_id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      flash(true, 'Datos de prueba eliminados.')
      await cargar()
      const updated = { ...selectedTenant, sandbox_tenant_id: null }
      setSelectedTenant(updated)
      setUsuarios(prev => prev.map(u => ({ ...u, sandbox_tenant_id: null })))
    } catch (e: unknown) {
      flash(false, e instanceof Error ? e.message : 'Error')
    } finally {
      setWorking(false)
    }
  }

  const toggleUsuarioSandbox = async (u: UsuarioSandbox) => {
    if (!selectedTenant?.sandbox_tenant_id) return
    const nuevoValor = u.sandbox_tenant_id ? null : selectedTenant.sandbox_tenant_id
    await supabase.from('usuarios').update({ sandbox_tenant_id: nuevoValor }).eq('id', u.id)
    setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, sandbox_tenant_id: nuevoValor } : x))
  }

  const ROL_LABEL: Record<string, string> = {
    gerencia: 'Gerencia', admin: 'Admin', mecanico: 'Profesional',
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Entornos de Prueba</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cada empresa puede tener un entorno sandbox aislado para probar sin afectar datos reales.
          Los usuarios asignados al sandbox usan esos datos cuando entran por la URL de prueba.
        </p>
      </div>

      {/* URL staging */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <span className="text-lg">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">URL del entorno de prueba</p>
          <a href={stagingUrl} target="_blank" rel="noopener noreferrer"
            className="text-sm text-amber-700 underline break-all">{stagingUrl}</a>
          <p className="text-xs text-amber-600 mt-1">
            Los usuarios activados abajo usan datos de prueba al ingresar por esta URL.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Lista de empresas */}
        <div className="md:col-span-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Empresas</p>
          </div>
          {loading ? (
            [1,2,3].map(i => <div key={i} className="h-12 mx-4 my-2 bg-gray-100 rounded-lg animate-pulse" />)
          ) : (
            <div className="divide-y divide-gray-50">
              {tenants.map(t => (
                <button
                  key={t.id}
                  onClick={() => seleccionar(t)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between ${
                    selectedTenant?.id === t.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate">{t.nombre}</span>
                  {t.sandbox_tenant_id && (
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-amber-400 ml-2" title="Tiene sandbox" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Panel derecho */}
        <div className="md:col-span-2 space-y-4">
          {!selectedTenant ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
              Selecciona una empresa
            </div>
          ) : (
            <>
              {msg && (
                <div className={`p-3 rounded-xl text-sm font-medium ${msg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {msg.ok ? '✓' : '✗'} {msg.text}
                </div>
              )}

              {/* Estado del sandbox */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{selectedTenant.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {selectedTenant.sandbox_tenant_id ? '● Sandbox activo' : '○ Sin sandbox'}
                    </p>
                  </div>
                  {!selectedTenant.sandbox_tenant_id ? (
                    <button
                      onClick={crearSandbox}
                      disabled={working}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      {working ? 'Creando...' : '+ Crear entorno de prueba'}
                    </button>
                  ) : (
                    <button
                      onClick={eliminarSandbox}
                      disabled={working}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-xl border border-red-200 transition-colors"
                    >
                      {working ? 'Eliminando...' : 'Borrar datos de prueba'}
                    </button>
                  )}
                </div>

                {selectedTenant.sandbox_tenant_id && (
                  <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 font-mono">
                    ID sandbox: {selectedTenant.sandbox_tenant_id}
                  </p>
                )}
              </div>

              {/* Usuarios */}
              {selectedTenant.sandbox_tenant_id && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b bg-gray-50">
                    <p className="text-sm font-semibold text-gray-700">Usuarios con acceso al sandbox</p>
                    <p className="text-xs text-gray-400">Activa el toggle para que ese usuario use datos de prueba en la URL de staging</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {usuarios.map(u => {
                      const activo = !!u.sandbox_tenant_id
                      return (
                        <div key={u.id} className={`flex items-center gap-3 px-5 py-3 ${activo ? '' : 'opacity-60'}`}>
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 flex-shrink-0">
                            {u.nombre[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{u.nombre}</p>
                            <p className="text-xs text-gray-400 truncate">{u.email} · {ROL_LABEL[u.rol] ?? u.rol}</p>
                          </div>
                          <button
                            onClick={() => toggleUsuarioSandbox(u)}
                            className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${activo ? 'bg-amber-400' : 'bg-gray-300'}`}
                          >
                            <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${activo ? 'translate-x-5' : ''}`} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
