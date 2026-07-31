'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import bcrypt from 'bcryptjs'

const RECURSOS = [
  { key: 'clientes', label: 'Clientes' },
  { key: 'conversaciones', label: 'Conversaciones' },
  { key: 'pagos', label: 'Pagos' },
] as const

type Permisos = Record<string, { lectura: boolean; escritura: boolean }>

type ApiKeyRow = {
  id: string
  nombre: string
  key_prefix: string
  permisos: Permisos
  activa: boolean
  ultimo_uso: string | null
  created_at: string
  expira_en: string | null
}

const API_KEY_PREFIX = 'opk_live_'

function generarKey(): { key: string; prefix: string } {
  const bytes = new Uint8Array(16)
  window.crypto.getRandomValues(bytes)
  const random = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  const key = `${API_KEY_PREFIX}${random}`
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 8) }
}

function permisosVacios(): Permisos {
  const p: Permisos = {}
  RECURSOS.forEach(r => { p[r.key] = { lectura: false, escritura: false } })
  return p
}

export default function ApiKeysPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNuevo, setShowNuevo] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [permisosNuevo, setPermisosNuevo] = useState<Permisos>(permisosVacios())
  const [creando, setCreando] = useState(false)
  const [keyGenerada, setKeyGenerada] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const esGerencia = profile?.rol === 'gerencia'

  const toast = (text: string, ok = true) => {
    setToastMsg({ text, ok })
    setTimeout(() => setToastMsg(null), 3500)
  }

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const { data } = await supabase
      .from('api_keys')
      .select('id, nombre, key_prefix, permisos, activa, ultimo_uso, created_at, expira_en')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
    setKeys((data as ApiKeyRow[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  const generar = async () => {
    if (!nombreNuevo.trim() || !profile?.tenant_id) return
    setCreando(true)
    try {
      const { key, prefix } = generarKey()
      const key_hash = await bcrypt.hash(key, 10)
      const { error } = await supabase.from('api_keys').insert({
        tenant_id: profile.tenant_id,
        nombre: nombreNuevo.trim(),
        key_hash,
        key_prefix: prefix,
        permisos: permisosNuevo,
        creada_por: profile.id,
      })
      if (error) throw error
      setKeyGenerada(key)
      setShowNuevo(false)
      setNombreNuevo('')
      setPermisosNuevo(permisosVacios())
      await cargar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al generar la key', false)
    } finally {
      setCreando(false)
    }
  }

  const revocar = async (k: ApiKeyRow) => {
    if (!confirm(`¿Revocar la key "${k.nombre}"? Dejará de funcionar de inmediato.`)) return
    const { error } = await supabase.from('api_keys').update({ activa: !k.activa }).eq('id', k.id)
    if (error) { toast(error.message, false); return }
    toast(k.activa ? 'Key revocada' : 'Key reactivada')
    await cargar()
  }

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto)
    toast('Copiado al portapapeles')
  }

  if (!esGerencia && !loading) {
    return <div className="p-6 text-sm text-gray-500">Esta sección es solo para el rol Gerencia.</div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg max-w-sm ${toastMsg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMsg.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500 mt-1">
            Acceso programático a la API pública de OptiDesk (<code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/api/v1/...</code>). Ver documentación en <a href="/docs/api" target="_blank" className="text-blue-600 hover:underline">/docs/api</a>.
          </p>
        </div>
        <button
          onClick={() => { setShowNuevo(true); setPermisosNuevo(permisosVacios()) }}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          + Generar nueva key
        </button>
      </div>

      {/* Lista */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin API keys creadas aún.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Nombre</th>
                <th className="text-left px-4 py-2.5">Prefix</th>
                <th className="text-left px-4 py-2.5">Permisos</th>
                <th className="text-left px-4 py-2.5">Último uso</th>
                <th className="text-left px-4 py-2.5">Estado</th>
                <th className="text-right px-4 py-2.5">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map(k => (
                <tr key={k.id} className={!k.activa ? 'opacity-50' : ''}>
                  <td className="px-4 py-3 font-medium text-gray-900">{k.nombre}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{k.key_prefix}...</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {RECURSOS.filter(r => k.permisos?.[r.key]?.lectura || k.permisos?.[r.key]?.escritura).map(r => (
                        <span key={r.key} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                          {r.label} {k.permisos[r.key].escritura ? 'R/W' : 'R'}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {k.ultimo_uso ? new Date(k.ultimo_uso).toLocaleString('es-CO') : 'Nunca'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${k.activa ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                      {k.activa ? 'Activa' : 'Revocada'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => revocar(k)} className="text-xs text-red-600 hover:text-red-800 font-medium">
                      {k.activa ? 'Revocar' : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nueva key */}
      {showNuevo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="font-bold text-gray-900">Generar nueva API key</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre descriptivo</label>
              <input
                value={nombreNuevo}
                onChange={e => setNombreNuevo(e.target.value)}
                placeholder="Ej: Integración con sistema de facturación"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Permisos por recurso</label>
              <div className="space-y-2">
                {RECURSOS.map(r => (
                  <div key={r.key} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">{r.label}</span>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={permisosNuevo[r.key]?.lectura ?? false}
                          onChange={e => setPermisosNuevo(p => ({ ...p, [r.key]: { ...p[r.key], lectura: e.target.checked } }))} />
                        Lectura
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={permisosNuevo[r.key]?.escritura ?? false}
                          onChange={e => setPermisosNuevo(p => ({ ...p, [r.key]: { ...p[r.key], escritura: e.target.checked } }))} />
                        Escritura
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowNuevo(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={generar} disabled={!nombreNuevo.trim() || creando} className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {creando ? 'Generando...' : 'Generar key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal mostrar key generada (una sola vez) */}
      {keyGenerada && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="font-bold text-gray-900">✅ Key generada</h3>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Guárdala ahora — <strong>no podrás verla de nuevo</strong>. Solo se guardó su hash.
            </p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <code className="flex-1 text-xs font-mono text-gray-800 break-all">{keyGenerada}</code>
              <button onClick={() => copiar(keyGenerada)} className="text-xs text-blue-700 font-semibold hover:text-blue-900 flex-shrink-0">
                Copiar
              </button>
            </div>
            <button onClick={() => setKeyGenerada(null)} className="w-full px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800">
              Ya la guardé
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
