'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

/* ─── Tipos ─────────────────────────────────────────────── */
interface Subcategoria { id: string; nombre: string; activo: boolean }
interface Categoria { id: string; nombre: string; activo: boolean; subcategorias_servicio: Subcategoria[] }
interface MetodoPago { id: string; nombre: string; activo: boolean }

/* ─── Helpers ────────────────────────────────────────────── */
function ToggleSwitch({ activo, onChange }: { activo: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${activo ? 'bg-green-500' : 'bg-gray-300'}`}>
      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${activo ? 'translate-x-4' : ''}`} />
    </button>
  )
}

function PencilBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Renombrar">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
  )
}

function TrashBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-red-400 hover:text-red-600 transition-colors p-1" title="Eliminar">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════ */
export default function ConfigServicioPage() {
  const supabase = createClient()
  const { profile } = useAuth()

  /* ── Estado tipos de servicio ── */
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [nuevaCat, setNuevaCat] = useState('')
  const [nuevaSubcats, setNuevaSubcats] = useState<Record<string, string>>({})
  const [savingCat, setSavingCat] = useState(false)
  const [editandoCat, setEditandoCat] = useState<string | null>(null)
  const [editNombreCat, setEditNombreCat] = useState('')

  /* ── Estado métodos de pago ── */
  const [metodos, setMetodos] = useState<MetodoPago[]>([])
  const [nuevoMetodo, setNuevoMetodo] = useState('')
  const [savingMetodo, setSavingMetodo] = useState(false)
  const [editandoMetodo, setEditandoMetodo] = useState<string | null>(null)
  const [editNombreMetodo, setEditNombreMetodo] = useState('')

  const [loading, setLoading] = useState(true)

  /* ── Estado carga catálogo UMA ── */
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; msg: string } | null>(null)

  /* ── Carga ── */
  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    const [{ data: cats }, { data: mets }] = await Promise.all([
      supabase.from('categorias_servicio')
        .select('id, nombre, activo, subcategorias_servicio(id, nombre, activo)')
        .eq('tenant_id', profile.tenant_id).order('orden'),
      supabase.from('metodos_pago')
        .select('id, nombre, activo')
        .eq('tenant_id', profile.tenant_id).order('nombre'),
    ])
    setCategorias((cats as Categoria[]) ?? [])
    setMetodos((mets as MetodoPago[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  /* ── Categorías: acciones ── */
  const addCategoria = async () => {
    if (!nuevaCat.trim() || !profile?.tenant_id) return
    setSavingCat(true)
    await supabase.from('categorias_servicio').insert({
      tenant_id: profile.tenant_id, nombre: nuevaCat.trim(), orden: categorias.length + 1,
    })
    setNuevaCat('')
    await cargar()
    setSavingCat(false)
  }

  const deleteCategoria = async (id: string) => {
    if (!confirm('¿Eliminar este tipo de servicio?')) return
    await supabase.from('categorias_servicio').delete().eq('id', id)
    await cargar()
  }

  const toggleCat = async (id: string, activo: boolean) => {
    await supabase.from('categorias_servicio').update({ activo: !activo }).eq('id', id)
    setCategorias((prev) => prev.map((c) => c.id === id ? { ...c, activo: !activo } : c))
  }

  const guardarNombreCat = async (id: string) => {
    if (!editNombreCat.trim()) return
    await supabase.from('categorias_servicio').update({ nombre: editNombreCat.trim() }).eq('id', id)
    setEditandoCat(null)
    await cargar()
  }

  const addSubcategoria = async (categoriaId: string) => {
    const nombre = (nuevaSubcats[categoriaId] ?? '').trim()
    if (!nombre) return
    await supabase.from('subcategorias_servicio').insert({ categoria_id: categoriaId, nombre, orden: 99 })
    setNuevaSubcats((p) => ({ ...p, [categoriaId]: '' }))
    await cargar()
  }

  const deleteSubcategoria = async (id: string) => {
    await supabase.from('subcategorias_servicio').delete().eq('id', id)
    await cargar()
  }

  const toggleSub = async (id: string, activo: boolean) => {
    await supabase.from('subcategorias_servicio').update({ activo: !activo }).eq('id', id)
    await cargar()
  }

  /* ── Métodos de pago: acciones ── */
  const addMetodo = async () => {
    if (!nuevoMetodo.trim() || !profile?.tenant_id) return
    setSavingMetodo(true)
    await supabase.from('metodos_pago').insert({
      tenant_id: profile.tenant_id, nombre: nuevoMetodo.trim(), activo: true,
    })
    setNuevoMetodo('')
    await cargar()
    setSavingMetodo(false)
  }

  const deleteMetodo = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return
    await supabase.from('metodos_pago').delete().eq('id', id)
    await cargar()
  }

  const toggleMetodo = async (id: string, activo: boolean) => {
    await supabase.from('metodos_pago').update({ activo: !activo }).eq('id', id)
    setMetodos((prev) => prev.map((m) => m.id === id ? { ...m, activo: !activo } : m))
  }

  const guardarNombreMetodo = async (id: string) => {
    if (!editNombreMetodo.trim()) return
    await supabase.from('metodos_pago').update({ nombre: editNombreMetodo.trim() }).eq('id', id)
    setEditandoMetodo(null)
    await cargar()
  }

  const handleUploadRepuestos = async () => {
    if (!uploadFile) return
    setUploading(true)
    setUploadResult(null)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      const res = await fetch('/api/repuestos-uma/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setUploadResult({ ok: false, msg: json.error ?? 'Error al procesar el archivo' })
      } else {
        const dupMsg = json.duplicados > 0 ? ` (${json.duplicados} referencias duplicadas omitidas)` : ''
        setUploadResult({ ok: true, msg: `✓ ${json.insertados.toLocaleString()} repuestos actualizados de ${json.total.toLocaleString()}${dupMsg}` })
        setUploadFile(null)
      }
    } catch {
      setUploadResult({ ok: false, msg: 'Error de conexión' })
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Cargando...</div>

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Config Servicio Técnico</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona los tipos de servicio y métodos de pago disponibles en el taller.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ══════════════════════════════════════════
            COLUMNA 1 — TIPOS DE SERVICIO
        ══════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Tipos de servicio</h2>
              <p className="text-xs text-gray-400">Aparecen como botones al crear una recepción</p>
            </div>
          </div>

          <div className="space-y-2">
            {categorias.length === 0 && (
              <p className="text-sm text-gray-400 italic">Sin tipos de servicio.</p>
            )}
            {categorias.map((cat) => (
              <div key={cat.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!cat.activo ? 'opacity-60' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                  {editandoCat === cat.id ? (
                    <>
                      <input value={editNombreCat} onChange={(e) => setEditNombreCat(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarNombreCat(cat.id); if (e.key === 'Escape') setEditandoCat(null) }}
                        autoFocus className="flex-1 px-2 py-1 border border-blue-400 rounded-lg text-sm font-semibold focus:outline-none" />
                      <button onClick={() => guardarNombreCat(cat.id)}
                        className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Guardar</button>
                      <button onClick={() => setEditandoCat(null)}
                        className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 font-semibold text-gray-900 text-sm">{cat.nombre}</span>
                      <PencilBtn onClick={() => { setEditandoCat(cat.id); setEditNombreCat(cat.nombre) }} />
                      <ToggleSwitch activo={cat.activo} onChange={() => toggleCat(cat.id, cat.activo)} />
                      <TrashBtn onClick={() => deleteCategoria(cat.id)} />
                    </>
                  )}
                </div>
                <div className="px-4 py-3 space-y-2">
                  {cat.subcategorias_servicio.map((sub) => (
                    <div key={sub.id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 ${!sub.activo ? 'opacity-50' : ''}`}>
                      <span className="text-sm text-gray-700">{sub.nombre}</span>
                      <div className="flex items-center gap-2">
                        <ToggleSwitch activo={sub.activo} onChange={() => toggleSub(sub.id, sub.activo)} />
                        <button onClick={() => deleteSubcategoria(sub.id)} className="text-red-400 hover:text-red-600">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <input value={nuevaSubcats[cat.id] ?? ''}
                      onChange={(e) => setNuevaSubcats((p) => ({ ...p, [cat.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addSubcategoria(cat.id)}
                      placeholder="Agregar subcategoría..."
                      className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <button onClick={() => addSubcategoria(cat.id)} disabled={!nuevaSubcats[cat.id]?.trim()}
                      className="px-2 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded-lg text-xs font-semibold">+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Agregar categoría */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Nuevo tipo</p>
            <div className="flex gap-2">
              <input value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCategoria()}
                placeholder="Ej: Garantía, Cambio Aceite..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <button onClick={addCategoria} disabled={savingCat || !nuevaCat.trim()}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-200 text-white rounded-lg text-sm font-semibold transition-colors">
                {savingCat ? '...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            COLUMNA 2 — MÉTODOS DE PAGO
        ══════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Métodos de pago</h2>
              <p className="text-xs text-gray-400">Aparecen al registrar el pago de una orden</p>
            </div>
          </div>

          <div className="space-y-2">
            {metodos.length === 0 && (
              <p className="text-sm text-gray-400 italic">Sin métodos de pago.</p>
            )}
            {metodos.map((m) => (
              <div key={m.id} className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-2 shadow-sm ${!m.activo ? 'opacity-60' : 'border-gray-200'}`}>
                {editandoMetodo === m.id ? (
                  <>
                    <input value={editNombreMetodo} onChange={(e) => setEditNombreMetodo(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') guardarNombreMetodo(m.id); if (e.key === 'Escape') setEditandoMetodo(null) }}
                      autoFocus className="flex-1 px-2 py-1 border border-blue-400 rounded-lg text-sm font-semibold focus:outline-none" />
                    <button onClick={() => guardarNombreMetodo(m.id)}
                      className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold">Guardar</button>
                    <button onClick={() => setEditandoMetodo(null)}
                      className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-semibold text-gray-900 text-sm">{m.nombre}</span>
                    <PencilBtn onClick={() => { setEditandoMetodo(m.id); setEditNombreMetodo(m.nombre) }} />
                    <ToggleSwitch activo={m.activo} onChange={() => toggleMetodo(m.id, m.activo)} />
                    <TrashBtn onClick={() => deleteMetodo(m.id, m.nombre)} />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Agregar método */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Nuevo método</p>
            <div className="flex gap-2">
              <input value={nuevoMetodo} onChange={(e) => setNuevoMetodo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMetodo()}
                placeholder="Ej: Efectivo, Nequi, Transferencia..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <button onClick={addMetodo} disabled={savingMetodo || !nuevoMetodo.trim()}
                className="px-4 py-2 bg-green-700 hover:bg-green-800 disabled:bg-green-200 text-white rounded-lg text-sm font-semibold transition-colors">
                {savingMetodo ? '...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════
          SECCIÓN 3 — CATÁLOGO REPUESTOS UMA
      ══════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Catálogo Repuestos UMA</h2>
            <p className="text-xs text-gray-500">
              Carga el Excel de precios UMA. Se actualizan todos los repuestos por referencia — hoja &quot;Pedido&quot;, fila 12 en adelante.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <label className="flex-1 cursor-pointer">
              <div className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl transition-colors ${
                uploadFile ? 'border-purple-400 bg-purple-50' : 'border-gray-300 hover:border-purple-300 hover:bg-purple-50/50'
              }`}>
                <svg className="w-5 h-5 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <div className="min-w-0">
                  {uploadFile ? (
                    <>
                      <p className="text-sm font-semibold text-purple-800 truncate">{uploadFile.name}</p>
                      <p className="text-xs text-purple-600">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-700">Seleccionar archivo Excel</p>
                      <p className="text-xs text-gray-400">FORMATO REPUESTOS UMA .xlsx</p>
                    </>
                  )}
                </div>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                onChange={(e) => {
                  setUploadFile(e.target.files?.[0] ?? null)
                  setUploadResult(null)
                }}
              />
            </label>

            <button
              onClick={handleUploadRepuestos}
              disabled={!uploadFile || uploading}
              className="px-5 py-3 bg-purple-700 hover:bg-purple-800 disabled:bg-purple-200 text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Procesando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Cargar catálogo
                </>
              )}
            </button>
          </div>

          {uploadResult && (
            <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm ${
              uploadResult.ok
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <span className="flex-shrink-0 mt-0.5">{uploadResult.ok ? '✓' : '✗'}</span>
              <span>{uploadResult.msg}</span>
            </div>
          )}

          <p className="text-xs text-gray-400">
            El proceso puede tardar 1-2 minutos para archivos con +18.000 repuestos. No cierres la página durante la carga.
          </p>
        </div>
      </div>

    </div>
  )
}
