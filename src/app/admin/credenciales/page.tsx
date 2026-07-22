'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface Cred {
  id: string
  nombre: string
  categoria: string
  usuario: string | null
  password: string
  link: string | null
  notas: string | null
  created_at: string
}

const CAT_ICONS: Record<string, string> = {
  'Redes Sociales': '📱', 'Financiero': '💳', 'Correos': '✉️',
  'Hosting & Web': '🌐', 'Proveedores': '🏭', 'Herramientas': '🔧',
  'Streaming': '🎬', 'General': '🔑',
}
function catIcon(cat: string) { return CAT_ICONS[cat] ?? '🔑' }

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} title="Copiar" className="p-1 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0">
      {copied
        ? <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
        : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
    </button>
  )
}

const CATS_DEFAULT = ['General', 'Redes Sociales', 'Financiero', 'Correos', 'Hosting & Web', 'Proveedores', 'Herramientas', 'Streaming']

const EMPTY_FORM = { nombre: '', categoria: 'General', catNueva: '', usuario: '', password: '', link: '', notas: '' }

export default function CredencialesPage() {
  const { profile } = useAuth()
  const [creds, setCreds]           = useState<Cred[]>([])
  const [cargando, setCargando]     = useState(true)
  const [catActual, setCatActual]   = useState('Todas')
  const [sel, setSel]               = useState<Cred | null>(null)
  const [mostrarPass, setMostrarPass] = useState<Record<string, boolean>>({})
  const [modalOpen, setModalOpen]   = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const res = await fetch('/api/admin/credenciales/listar')
    if (res.ok) {
      const data = await res.json() as { credenciales: Cred[] }
      setCreds(data.credenciales)
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const categorias = ['Todas', ...[...new Set(creds.map(c => c.categoria))].sort()]
  const filtradas  = catActual === 'Todas' ? creds : creds.filter(c => c.categoria === catActual)

  function abrirNueva() {
    setForm(EMPTY_FORM)
    setEditMode(false)
    setError(null)
    setModalOpen(true)
  }

  function abrirEditar(c: Cred) {
    setForm({ nombre: c.nombre, categoria: c.categoria, catNueva: '', usuario: c.usuario ?? '', password: c.password, link: c.link ?? '', notas: c.notas ?? '' })
    setSel(c)
    setEditMode(true)
    setError(null)
    setModalOpen(true)
  }

  function togglePass(id: string) {
    setMostrarPass(p => ({ ...p, [id]: !p[id] }))
  }

  const catFinal = form.catNueva.trim() || (form.categoria !== '__nueva__' ? form.categoria : '') || 'General'

  async function guardar() {
    if (!form.nombre.trim() || !form.password.trim()) {
      setError('Nombre y contraseña son obligatorios')
      return
    }
    setGuardando(true)
    setError(null)

    const payload = {
      nombre:    form.nombre.trim(),
      categoria: catFinal,
      usuario:   form.usuario.trim() || null,
      password:  form.password,
      link:      form.link.trim() || null,
      notas:     form.notas.trim() || null,
    }

    const url    = editMode && sel ? `/api/admin/credenciales/${sel.id}` : '/api/admin/credenciales/nuevo'
    const method = editMode ? 'PATCH' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data   = await res.json() as { cred?: Cred; error?: string }

    if (res.ok && data.cred) {
      if (editMode) setCreds(p => p.map(c => c.id === data.cred!.id ? data.cred! : c))
      else setCreds(p => [...p, data.cred!])
      setModalOpen(false)
      setSel(null)
    } else {
      setError(data.error ?? 'Error al guardar')
    }
    setGuardando(false)
  }

  async function eliminar(c: Cred) {
    if (!confirm(`¿Eliminar "${c.nombre}"?`)) return
    const res = await fetch(`/api/admin/credenciales/${c.id}`, { method: 'DELETE' })
    if (res.ok) {
      setCreds(p => p.filter(x => x.id !== c.id))
      if (sel?.id === c.id) setSel(null)
    }
  }

  if (!profile) return null

  const catsExistentes = [...new Set(creds.map(c => c.categoria))].sort()
  const catsSelect     = [...new Set([...CATS_DEFAULT, ...catsExistentes])].sort()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100 bg-white flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Credenciales</h1>
          <p className="text-xs text-gray-500">Cuentas, plataformas y accesos internos — solo gerencia y dueño</p>
        </div>
        <button
          onClick={abrirNueva}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva credencial
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-5 py-2.5 border-b border-gray-100 bg-white overflow-x-auto">
        {categorias.map(cat => (
          <button
            key={cat}
            onClick={() => setCatActual(cat)}
            className={`flex-shrink-0 px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              catActual === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat === 'Todas'
              ? `Todas (${creds.length})`
              : `${catIcon(cat)} ${cat} (${creds.filter(c => c.categoria === cat).length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {cargando ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Cargando...
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <span className="text-5xl">🔑</span>
            <p className="text-sm">
              {creds.length === 0 ? 'Aún no hay credenciales guardadas.' : 'Sin credenciales en esta categoría.'}
            </p>
            {creds.length === 0 && (
              <button onClick={abrirNueva} className="text-sm text-blue-600 hover:underline">Agregar primera credencial</button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtradas.map(c => {
              const visible = mostrarPass[c.id]
              return (
                <div
                  key={c.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl flex-shrink-0">{catIcon(c.categoria)}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{c.nombre}</p>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{c.categoria}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => abrirEditar(c)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => eliminar(c)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="space-y-2">
                    {c.usuario && (
                      <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-gray-400 font-medium">Usuario</p>
                          <p className="text-xs text-gray-700 font-mono truncate">{c.usuario}</p>
                        </div>
                        <CopyBtn text={c.usuario} />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-gray-400 font-medium">Contraseña</p>
                        <p className="text-xs text-gray-700 font-mono truncate">
                          {visible ? c.password : '•'.repeat(Math.min(c.password.length, 16))}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => togglePass(c.id)}
                          className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                          title={visible ? 'Ocultar' : 'Mostrar'}
                        >
                          {visible
                            ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                            : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                        </button>
                        <CopyBtn text={c.password} />
                      </div>
                    </div>

                    {c.link && (
                      <a
                        href={c.link.startsWith('http') ? c.link : `https://${c.link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline px-1 truncate"
                      >
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6v6M20 4L10 14" />
                        </svg>
                        <span className="truncate">{c.link}</span>
                      </a>
                    )}

                    {c.notas && (
                      <p className="text-[11px] text-gray-400 italic px-1 line-clamp-2">{c.notas}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal crear / editar */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {editMode ? 'Editar credencial' : 'Nueva credencial'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Nombre */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nombre / Item <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej: Instagram negocio, Gmail principal, Bancolombia..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Categoría / Grupo</label>
                <div className="flex gap-2">
                  <select
                    value={form.categoria}
                    onChange={e => { setForm(p => ({ ...p, categoria: e.target.value })); if (e.target.value !== '__nueva__') setForm(p => ({ ...p, catNueva: '' })) }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {catsSelect.map(c => <option key={c} value={c}>{catIcon(c)} {c}</option>)}
                    {catsExistentes.filter(c => !catsSelect.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__nueva__">+ Nueva categoría...</option>
                  </select>
                  {form.categoria === '__nueva__' && (
                    <input
                      type="text"
                      value={form.catNueva}
                      onChange={e => setForm(p => ({ ...p, catNueva: e.target.value }))}
                      placeholder="Nombre de categoría"
                      autoFocus
                      className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              </div>

              {/* Usuario */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Usuario / Email</label>
                <input
                  type="text"
                  value={form.usuario}
                  onChange={e => setForm(p => ({ ...p, usuario: e.target.value }))}
                  placeholder="usuario@correo.com"
                  autoComplete="off"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Contraseña */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Contraseña <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    type={mostrarPass['__modal__'] ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Contraseña"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 pr-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => togglePass('__modal__')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  >
                    {mostrarPass['__modal__']
                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                  </button>
                </div>
              </div>

              {/* Link */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Link / URL <span className="text-gray-400">(opcional)</span></label>
                <input
                  type="url"
                  value={form.link}
                  onChange={e => setForm(p => ({ ...p, link: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Notas */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Notas <span className="text-gray-400">(opcional)</span></label>
                <textarea
                  value={form.notas}
                  onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                  rows={2}
                  placeholder="Información adicional sobre esta cuenta..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={guardar}
                  disabled={guardando}
                  className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {guardando ? 'Guardando...' : editMode ? 'Guardar cambios' : 'Crear credencial'}
                </button>
                {editMode && sel && (
                  <button
                    onClick={() => { eliminar(sel); setModalOpen(false) }}
                    className="px-4 py-2.5 text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
                    title="Eliminar"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
