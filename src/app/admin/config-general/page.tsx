'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const SECCIONES = [
  { key: 'ventas',        label: 'Seguimiento de Ventas',        ruta: '/admin/ventas',               icono: '📊' },
  { key: 'ordenes',       label: 'Servicio Técnico',              ruta: '/admin/ordenes',              icono: '🔧' },
  { key: 'repuestos',     label: 'Repuestos',                     ruta: '/admin/repuestos',            icono: '⚙️' },
  { key: 'caja',          label: 'Caja',                          ruta: '/admin/caja',                 icono: '💰' },
  { key: 'clientes',      label: 'Clientes',                      ruta: '/admin/clientes',             icono: '👥' },
  { key: 'inventario',    label: 'Inventario',                    ruta: '/admin/inventario',           icono: '📦' },
  { key: 'mensajes',      label: 'Mensajes / Bandeja',            ruta: '/admin/mensajes',             icono: '💬' },
  { key: 'reportes',      label: 'Reportes',                      ruta: '/admin/reportes',             icono: '📈' },
  { key: 'cotizaciones',  label: 'Cotizaciones S.T.',             ruta: '/admin/cotizaciones-servtec', icono: '📄' },
  { key: 'lista_precios', label: 'Lista de Motos / Precios',      ruta: '/admin/lista-precios',        icono: '🏍️' },
]

export default function ConfigGeneralPage() {
  const supabase = createClient()
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [config, setConfig]     = useState<Record<string, string>>({})
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [msg, setMsg]           = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
    if (!perfil?.tenant_id) return
    const { data: tenant } = await supabase.from('tenants').select('manuales_config').eq('id', perfil.tenant_id).single()
    setConfig((tenant?.manuales_config ?? {}) as Record<string, string>)
    setLoading(false)
  }

  function toast(text: string, type: 'ok' | 'err') {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3500)
  }

  async function subir(seccion: string, file: File) {
    if (!file.name.endsWith('.pdf')) { toast('Solo se permiten archivos PDF', 'err'); return }
    setUploading(seccion)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('seccion', seccion)
      const res = await fetch('/api/admin/config-general/subir', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al subir')
      setConfig(p => ({ ...p, [seccion]: json.key }))
      toast('Manual subido correctamente', 'ok')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al subir', 'err')
    }
    setUploading(null)
    if (fileRefs.current[seccion]) fileRefs.current[seccion]!.value = ''
  }

  async function eliminar(seccion: string) {
    if (!confirm('¿Eliminar este manual?')) return
    setDeleting(seccion)
    try {
      const res = await fetch(`/api/admin/config-general/eliminar?seccion=${seccion}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      setConfig(p => { const n = { ...p }; delete n[seccion]; return n })
      toast('Manual eliminado', 'ok')
    } catch {
      toast('Error al eliminar', 'err')
    }
    setDeleting(null)
  }

  async function verManual(seccion: string) {
    const res = await fetch(`/api/admin/config-general/url?seccion=${seccion}`)
    if (!res.ok) return
    const { url } = await res.json()
    window.open(url, '_blank')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Config General</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sube un PDF de documentación o manual para cada sección del sistema.
          Aparecerá un botón flotante <strong>📖 Manual</strong> en cada sección para que cualquier usuario pueda consultarlo.
        </p>
      </div>

      {/* Toast */}
      {msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold ${
          msg.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {msg.type === 'ok' ? '✓' : '✗'} {msg.text}
        </div>
      )}

      <div className="space-y-3">
        {SECCIONES.map(sec => {
          const tieneManual = !!config[sec.key]
          const isUp  = uploading === sec.key
          const isDel = deleting  === sec.key

          return (
            <div key={sec.key}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4">

              {/* Ícono + info */}
              <div className="text-2xl flex-shrink-0">{sec.icono}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{sec.label}</p>
                <p className="text-xs text-gray-400">{sec.ruta}</p>
              </div>

              {/* Estado */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {tieneManual ? (
                  <>
                    <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                      ✓ Manual activo
                    </span>
                    <button
                      onClick={() => verManual(sec.key)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50">
                      Ver ↗
                    </button>
                    <button
                      onClick={() => eliminar(sec.key)}
                      disabled={isDel}
                      className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40">
                      {isDel ? '...' : 'Eliminar'}
                    </button>
                    <label className="cursor-pointer text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded-lg hover:bg-gray-50">
                      Reemplazar
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        ref={el => { fileRefs.current[sec.key] = el }}
                        disabled={isUp}
                        onChange={e => { if (e.target.files?.[0]) subir(sec.key, e.target.files[0]) }}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] text-gray-400">Sin manual</span>
                    <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      isUp
                        ? 'bg-gray-100 text-gray-400 cursor-default'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}>
                      {isUp ? (
                        <>
                          <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                          Subiendo...
                        </>
                      ) : (
                        <>
                          ⬆ Subir PDF
                        </>
                      )}
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        ref={el => { fileRefs.current[sec.key] = el }}
                        disabled={isUp}
                        onChange={e => { if (e.target.files?.[0]) subir(sec.key, e.target.files[0]) }}
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-2xl border border-blue-100">
        <p className="text-xs font-semibold text-blue-800 mb-1">¿Cómo funciona?</p>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>Sube un PDF para cada sección. Solo archivos PDF, máximo 30 MB.</li>
          <li>Cuando un usuario esté en esa sección, verá el botón <strong>📖 Manual</strong> en la esquina superior derecha.</li>
          <li>Al hacer clic, el PDF se abre en una nueva pestaña.</li>
          <li>Solo Gerencia y Dueño pueden subir o eliminar manuales.</li>
        </ul>
      </div>
    </div>
  )
}
