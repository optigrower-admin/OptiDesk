'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface Contacto {
  id: string
  nombre: string
  categoria: string
  celulares: string[]
  correos: string[]
  links: string[]
  notas: string | null
  created_at: string
}

const CAT_ICONS: Record<string, string> = {
  'Proveedores': '🏭', 'Soporte Técnico': '🛠️', 'Aliados': '🤝',
  'Bancos': '🏦', 'Transporte': '🚚', 'Legal / Contable': '📑', 'General': '📇',
}
function catIcon(cat: string) { return CAT_ICONS[cat] ?? '📇' }

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

// Input de "uno o más" valores (celulares, correos, links) para el modal.
function ListaValores({ label, placeholder, type, values, onChange }: {
  label: string
  placeholder: string
  type: 'tel' | 'email' | 'url'
  values: string[]
  onChange: (v: string[]) => void
}) {
  const [nuevo, setNuevo] = useState('')

  function agregar() {
    const v = nuevo.trim()
    if (!v) return
    onChange([...values, v])
    setNuevo('')
  }

  function quitar(idx: number) {
    onChange(values.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      {values.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {values.map((v, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
              <span className="text-xs text-gray-700 truncate">{v}</span>
              <button type="button" onClick={() => quitar(idx)} className="p-0.5 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0" title="Quitar">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type={type}
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="button" onClick={agregar}
          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold rounded-lg transition-colors flex-shrink-0">
          + Agregar
        </button>
      </div>
    </div>
  )
}

const CATS_DEFAULT = ['General', 'Proveedores', 'Soporte Técnico', 'Aliados', 'Bancos', 'Transporte', 'Legal / Contable']

const EMPTY_FORM = { nombre: '', categoria: 'General', catNueva: '', celulares: [] as string[], correos: [] as string[], links: [] as string[], notas: '' }

export default function ContactosInternosPage() {
  const { profile } = useAuth()
  const [contactos, setContactos]   = useState<Contacto[]>([])
  const [cargando, setCargando]     = useState(true)
  const [catActual, setCatActual]   = useState('Todas')
  const [sel, setSel]               = useState<Contacto | null>(null)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const res = await fetch('/api/admin/contactos-internos/listar')
    if (res.ok) {
      const data = await res.json() as { contactos: Contacto[] }
      setContactos(data.contactos)
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const categorias = ['Todas', ...[...new Set(contactos.map(c => c.categoria))].sort()]
  const filtrados   = catActual === 'Todas' ? contactos : contactos.filter(c => c.categoria === catActual)

  function abrirNuevo() {
    setForm(EMPTY_FORM)
    setEditMode(false)
    setError(null)
    setModalOpen(true)
  }

  function abrirEditar(c: Contacto) {
    setForm({ nombre: c.nombre, categoria: c.categoria, catNueva: '', celulares: [...c.celulares], correos: [...c.correos], links: [...c.links], notas: c.notas ?? '' })
    setSel(c)
    setEditMode(true)
    setError(null)
    setModalOpen(true)
  }

  const catFinal = form.catNueva.trim() || (form.categoria !== '__nueva__' ? form.categoria : '') || 'General'

  async function guardar() {
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    setGuardando(true)
    setError(null)

    const payload = {
      nombre:     form.nombre.trim(),
      categoria:  catFinal,
      celulares:  form.celulares,
      correos:    form.correos,
      links:      form.links,
      notas:      form.notas.trim() || null,
    }

    const url    = editMode && sel ? `/api/admin/contactos-internos/${sel.id}` : '/api/admin/contactos-internos/nuevo'
    const method = editMode ? 'PATCH' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data   = await res.json() as { contacto?: Contacto; error?: string }

    if (res.ok && data.contacto) {
      if (editMode) setContactos(p => p.map(c => c.id === data.contacto!.id ? data.contacto! : c))
      else setContactos(p => [...p, data.contacto!])
      setModalOpen(false)
      setSel(null)
    } else {
      setError(data.error ?? 'Error al guardar')
    }
    setGuardando(false)
  }

  async function eliminar(c: Contacto) {
    if (!confirm(`¿Eliminar "${c.nombre}"?`)) return
    const res = await fetch(`/api/admin/contactos-internos/${c.id}`, { method: 'DELETE' })
    if (res.ok) {
      setContactos(p => p.filter(x => x.id !== c.id))
      if (sel?.id === c.id) setSel(null)
    }
  }

  if (!profile) return null

  const catsExistentes = [...new Set(contactos.map(c => c.categoria))].sort()
  const catsSelect     = [...new Set([...CATS_DEFAULT, ...catsExistentes])].sort()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100 bg-white flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Contactos Internos</h1>
          <p className="text-xs text-gray-500">Directorio de contactos de la empresa — solo gerencia y dueño</p>
        </div>
        <button
          onClick={abrirNuevo}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo contacto
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
              ? `Todas (${contactos.length})`
              : `${catIcon(cat)} ${cat} (${contactos.filter(c => c.categoria === cat).length})`}
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
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <span className="text-5xl">📇</span>
            <p className="text-sm">
              {contactos.length === 0 ? 'Aún no hay contactos guardados.' : 'Sin contactos en esta categoría.'}
            </p>
            {contactos.length === 0 && (
              <button onClick={abrirNuevo} className="text-sm text-blue-600 hover:underline">Agregar primer contacto</button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtrados.map(c => (
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
                  {c.celulares.map((tel, idx) => (
                    <div key={`tel-${idx}`} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <span className="text-xs flex-shrink-0">📱</span>
                        <p className="text-xs text-gray-700 font-mono truncate">{tel}</p>
                      </div>
                      <CopyBtn text={tel} />
                    </div>
                  ))}

                  {c.correos.map((mail, idx) => (
                    <div key={`mail-${idx}`} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <span className="text-xs flex-shrink-0">✉️</span>
                        <p className="text-xs text-gray-700 font-mono truncate">{mail}</p>
                      </div>
                      <CopyBtn text={mail} />
                    </div>
                  ))}

                  {c.links.map((link, idx) => (
                    <a
                      key={`link-${idx}`}
                      href={link.startsWith('http') ? link : `https://${link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline px-1 truncate"
                    >
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6v6M20 4L10 14" />
                      </svg>
                      <span className="truncate">{link}</span>
                    </a>
                  ))}

                  {c.notas && (
                    <p className="text-[11px] text-gray-400 italic px-1 line-clamp-2">{c.notas}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear / editar */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {editMode ? 'Editar contacto' : 'Nuevo contacto'}
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
                  placeholder="Ej: Proveedor de repuestos, Contador, Taller aliado..."
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

              {/* Celulares */}
              <ListaValores
                label="Celulares"
                placeholder="Ej: 3001234567"
                type="tel"
                values={form.celulares}
                onChange={v => setForm(p => ({ ...p, celulares: v }))}
              />

              {/* Correos */}
              <ListaValores
                label="Correos"
                placeholder="correo@ejemplo.com"
                type="email"
                values={form.correos}
                onChange={v => setForm(p => ({ ...p, correos: v }))}
              />

              {/* Links */}
              <ListaValores
                label="Links"
                placeholder="https://..."
                type="url"
                values={form.links}
                onChange={v => setForm(p => ({ ...p, links: v }))}
              />

              {/* Notas */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Notas <span className="text-gray-400">(opcional)</span></label>
                <textarea
                  value={form.notas}
                  onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                  rows={2}
                  placeholder="Información adicional sobre este contacto..."
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
                  {guardando ? 'Guardando...' : editMode ? 'Guardar cambios' : 'Crear contacto'}
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
