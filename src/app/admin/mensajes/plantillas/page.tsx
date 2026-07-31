'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoHeader = 'texto' | 'imagen' | 'documento' | 'video' | 'ninguno'
type CategoriaMeta = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
type Boton = { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone_number?: string }

type Plantilla = {
  id: string
  nombre: string
  categoria: CategoriaKey
  categoria_meta: CategoriaMeta
  idioma: string
  cuerpo: string
  variables: string[]
  meta_template_name: string | null
  meta_template_id: string | null
  meta_status: MetaStatus
  meta_rechazo_motivo: string | null
  tipo_header: TipoHeader | null
  header_texto: string | null
  header_contenido: string | null
  footer_texto: string | null
  botones: Boton[]
  activa: boolean
  created_at: string
  updated_at: string
}

type CategoriaKey =
  | 'seguimiento_ventas' | 'post_visita' | 'servicio_tecnico'
  | 'referidos' | 'bienvenida' | 'recordatorio' | 'reactivacion' | 'otro'

type MetaStatus = 'borrador' | 'enviada_a_meta' | 'pendiente' | 'aprobada' | 'rechazada' | 'pausada' | 'deshabilitada'

const CATEGORIAS: Record<CategoriaKey, string> = {
  seguimiento_ventas: 'Seguimiento ventas',
  post_visita:        'Post visita',
  servicio_tecnico:   'Servicio técnico',
  referidos:          'Referidos',
  bienvenida:         'Bienvenida',
  recordatorio:       'Recordatorio',
  reactivacion:       'Reactivación',
  otro:               'Otro',
}

const CATEGORIAS_META: Record<CategoriaMeta, string> = {
  MARKETING:      'Marketing',
  UTILITY:        'Utilidad',
  AUTHENTICATION: 'Autenticación',
}

const CATEGORIA_META_AYUDA: Record<CategoriaMeta, string> = {
  MARKETING: 'Promociones, ofertas, remarketing, anuncios de producto nuevo. Requiere que el cliente haya interactuado antes o dado opt-in. Meta es más estricto aprobando estas.',
  UTILITY: 'Confirmaciones de cita, actualización de estado de trámite/cotización, recordatorios — no promocional. Se aprueban más rápido.',
  AUTHENTICATION: 'Códigos OTP/verificación. Formato muy rígido, casi no aplica a tu caso de uso salvo que verifiques identidad de cliente.',
}

const IDIOMAS: Record<string, string> = {
  es_CO: 'Español (Colombia)',
  es_MX: 'Español (México)',
  es:    'Español',
  en_US: 'Inglés (EE. UU.)',
}

const META_STATUS_LABELS: Record<MetaStatus, { label: string; cls: string }> = {
  borrador:        { label: 'Borrador',      cls: 'bg-gray-100 text-gray-600' },
  enviada_a_meta:  { label: 'En revisión',   cls: 'bg-yellow-100 text-yellow-700' },
  pendiente:       { label: 'Pendiente',     cls: 'bg-yellow-100 text-yellow-700' },
  aprobada:        { label: 'Aprobada',      cls: 'bg-green-100 text-green-700' },
  rechazada:       { label: 'Rechazada',     cls: 'bg-red-100 text-red-700' },
  pausada:         { label: 'Pausada',       cls: 'bg-gray-200 text-gray-600' },
  deshabilitada:   { label: 'Deshabilitada', cls: 'bg-gray-200 text-gray-500' },
}

type FiltroStatus = 'todas' | 'pendiente' | 'aprobada' | 'rechazada'

const FILTROS_STATUS: { value: FiltroStatus; label: string }[] = [
  { value: 'todas',     label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada',  label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas' },
]

// Plantillas pre-definidas como punto de partida
const PLANTILLAS_PREDEFINIDAS: {
  nombre: string; categoria: CategoriaKey; cuerpo: string; variables: string[]
  tipo_header: TipoHeader; header_texto: string; footer_texto: string
}[] = [
  {
    nombre: 'Bienvenida nuevo cliente',
    categoria: 'bienvenida',
    cuerpo: 'Hola {{nombre}}, bienvenido/a a {{taller}}. Estamos felices de tenerte como cliente. Si tienes alguna consulta no dudes en escribirnos.',
    variables: ['nombre', 'taller'],
    tipo_header: 'texto', header_texto: 'Bienvenido/a', footer_texto: 'Tu taller de confianza',
  },
  {
    nombre: 'Seguimiento post-visita 24h',
    categoria: 'post_visita',
    cuerpo: 'Hola {{nombre}}, gracias por visitarnos ayer. ¿Cómo te fue con el servicio de {{servicio}}? Tu opinión es muy importante para nosotros.',
    variables: ['nombre', 'servicio'],
    tipo_header: 'ninguno', header_texto: '', footer_texto: '',
  },
  {
    nombre: 'Recordatorio cita programada',
    categoria: 'recordatorio',
    cuerpo: 'Hola {{nombre}}, te recordamos que tienes una cita agendada para el {{fecha}} a las {{hora}} en {{taller}}. Por favor confirma tu asistencia.',
    variables: ['nombre', 'fecha', 'hora', 'taller'],
    tipo_header: 'texto', header_texto: 'Recordatorio de cita', footer_texto: '',
  },
  {
    nombre: 'Orden lista para entrega',
    categoria: 'servicio_tecnico',
    cuerpo: 'Hola {{nombre}}, tu moto {{modelo}} placa {{placa}} ya está lista. Puedes pasar a recogerla en horario de atención. Orden #{{orden}}.',
    variables: ['nombre', 'modelo', 'placa', 'orden'],
    tipo_header: 'texto', header_texto: 'Tu moto está lista', footer_texto: '',
  },
  {
    nombre: 'Seguimiento de ventas sin respuesta',
    categoria: 'seguimiento_ventas',
    cuerpo: 'Hola {{nombre}}, hace unos días conversamos sobre {{producto}}. ¿Pudiste evaluar la información que te enviamos? Estaremos encantados de resolver cualquier duda.',
    variables: ['nombre', 'producto'],
    tipo_header: 'ninguno', header_texto: '', footer_texto: '',
  },
  {
    nombre: 'Programa de referidos',
    categoria: 'referidos',
    cuerpo: 'Hola {{nombre}}, ¿sabías que por recomendar {{taller}} a un amigo obtienes {{beneficio}}? Comparte nuestro número y diles que te mencionen al contactarnos.',
    variables: ['nombre', 'taller', 'beneficio'],
    tipo_header: 'ninguno', header_texto: '', footer_texto: '',
  },
  {
    nombre: 'Reactivación cliente inactivo',
    categoria: 'reactivacion',
    cuerpo: 'Hola {{nombre}}, hace {{tiempo}} que no te vemos por {{taller}}. Te tenemos una oferta especial: {{oferta}}. ¡Nos encantaría verte pronto!',
    variables: ['nombre', 'tiempo', 'taller', 'oferta'],
    tipo_header: 'ninguno', header_texto: '', footer_texto: '',
  },
  {
    nombre: 'Notificación mantenimiento preventivo',
    categoria: 'recordatorio',
    cuerpo: 'Hola {{nombre}}, tu moto {{modelo}} está próxima a cumplir {{km}} km. Te recomendamos agendar su mantenimiento preventivo. Escríbenos para coordinar.',
    variables: ['nombre', 'modelo', 'km'],
    tipo_header: 'texto', header_texto: 'Mantenimiento preventivo', footer_texto: '',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractVariables(texto: string): string[] {
  const matches = texto.match(/\{\{([^}]+)\}\}/g) ?? []
  return [...new Set(matches.map(m => m.slice(2, -2).trim()))]
}

function renderPreview(cuerpo: string, vars: Record<string, string>): string {
  return cuerpo.replace(/\{\{([^}]+)\}\}/g, (_, name) => vars[name.trim()] || `[${name.trim()}]`)
}

function highlightVariables(text: string): React.ReactNode[] {
  const parts = text.split(/(\{\{[^}]+\}\})/g)
  return parts.map((part, i) =>
    part.match(/^\{\{.*\}\}$/)
      ? <mark key={i} className="bg-yellow-100 text-yellow-800 rounded px-0.5 font-mono text-xs">{part}</mark>
      : <span key={i}>{part}</span>
  )
}

type FormState = {
  nombre: string
  categoria: CategoriaKey
  categoria_meta: CategoriaMeta
  idioma: string
  cuerpo: string
  tipo_header: TipoHeader
  header_texto: string
  header_contenido: string
  footer_texto: string
  meta_template_name: string
  botones: Boton[]
  activa: boolean
}

const emptyForm = (): FormState => ({
  nombre: '', categoria: 'bienvenida', categoria_meta: 'UTILITY', idioma: 'es_CO', cuerpo: '',
  tipo_header: 'ninguno', header_texto: '', header_contenido: '', footer_texto: '',
  meta_template_name: '', botones: [], activa: true,
})

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PlantillasPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [plantillas, setPlantillas]   = useState<Plantilla[]>([])
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState<Plantilla | null>(null)
  const [isNew, setIsNew]             = useState(false)
  const [form, setForm]               = useState<FormState>(emptyForm())
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({})
  const [saving, setSaving]           = useState(false)
  const [enviando, setEnviando]       = useState(false)
  const [errorMeta, setErrorMeta]     = useState<string | null>(null)
  const [toastMsg, setToastMsg]       = useState<{ text: string; ok: boolean } | null>(null)
  const [search, setSearch]           = useState('')
  const [filterCat, setFilterCat]     = useState<CategoriaKey | 'todas'>('todas')
  const [filterStatus, setFilterStatus] = useState<FiltroStatus>('todas')
  const [confirmDelete, setConfirmDelete] = useState<Plantilla | null>(null)

  const isGerencia = profile?.rol === 'gerencia'
  const canEdit = isGerencia || profile?.rol === 'admin' || profile?.rol === 'control_total'
  // Meta no deja editar plantillas ya enviadas: solo se puede tocar el contenido
  // mientras esté en Borrador o Rechazada (para reenviar como nueva versión).
  const puedeEditarContenido = canEdit && (isNew || !selected || selected.meta_status === 'borrador' || selected.meta_status === 'rechazada')

  const toast = (text: string, ok = true) => {
    setToastMsg({ text, ok })
    setTimeout(() => setToastMsg(null), 3500)
  }

  const setF = <K extends keyof FormState>(key: K) => (val: FormState[K]) =>
    setForm(p => ({ ...p, [key]: val }))

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const { data } = await supabase
      .from('plantillas_mensajes')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .order('categoria')
      .order('nombre')
    setPlantillas((data as Plantilla[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  // Actualizar preview vars cuando cambian las variables del cuerpo
  const variablesDetectadas = useMemo(() => extractVariables(form.cuerpo), [form.cuerpo])

  useEffect(() => {
    setPreviewVars(prev => {
      const next: Record<string, string> = {}
      variablesDetectadas.forEach(v => { next[v] = prev[v] ?? '' })
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variablesDetectadas.join(',')])

  const formDesde = (p: Plantilla): FormState => ({
    nombre: p.nombre,
    categoria: p.categoria,
    categoria_meta: p.categoria_meta ?? 'UTILITY',
    idioma: p.idioma ?? 'es_CO',
    cuerpo: p.cuerpo,
    tipo_header: p.tipo_header ?? 'ninguno',
    header_texto: p.header_texto ?? '',
    header_contenido: p.header_contenido ?? '',
    footer_texto: p.footer_texto ?? '',
    meta_template_name: p.meta_template_name ?? '',
    botones: p.botones ?? [],
    activa: p.activa,
  })

  const selectPlantilla = (p: Plantilla) => {
    setSelected(p)
    setIsNew(false)
    setErrorMeta(null)
    setForm(formDesde(p))
    setPreviewVars({})
  }

  const nuevaPlantilla = () => {
    setSelected(null)
    setIsNew(true)
    setErrorMeta(null)
    setForm(emptyForm())
    setPreviewVars({})
  }

  const usarPredefinida = (p: typeof PLANTILLAS_PREDEFINIDAS[0]) => {
    setIsNew(true)
    setSelected(null)
    setErrorMeta(null)
    setForm({
      ...emptyForm(),
      nombre: p.nombre,
      categoria: p.categoria,
      cuerpo: p.cuerpo,
      tipo_header: p.tipo_header,
      header_texto: p.header_texto,
      footer_texto: p.footer_texto,
    })
  }

  const duplicar = async (p: Plantilla) => {
    if (!profile?.tenant_id || !canEdit) return
    setSaving(true)
    try {
      const data = {
        tenant_id:          profile.tenant_id,
        nombre:             `${p.nombre} (copia)`,
        categoria:          p.categoria,
        categoria_meta:     p.categoria_meta,
        idioma:             p.idioma,
        cuerpo:             p.cuerpo,
        variables:          p.variables,
        tipo_header:        p.tipo_header,
        header_texto:       p.header_texto,
        header_contenido:   p.header_contenido,
        footer_texto:       p.footer_texto,
        meta_template_name: p.meta_template_name ? `${p.meta_template_name}_copia` : null,
        botones:            p.botones,
        meta_status:        'borrador',
        meta_template_id:   null,
        meta_rechazo_motivo: null,
        activa:             true,
      }
      const { data: creada, error } = await supabase.from('plantillas_mensajes').insert(data).select().single()
      if (error) throw error
      toast('Plantilla duplicada')
      await cargar()
      if (creada) selectPlantilla(creada as Plantilla)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al duplicar', false)
    } finally {
      setSaving(false)
    }
  }

  const guardar = async () => {
    if (!form.nombre || !form.cuerpo) { toast('Nombre y cuerpo son obligatorios', false); return }
    if (!profile?.tenant_id) return
    setSaving(true)
    setErrorMeta(null)
    try {
      const variables = extractVariables(form.cuerpo)
      const data = {
        tenant_id:          profile.tenant_id,
        nombre:             form.nombre,
        categoria:          form.categoria,
        categoria_meta:     form.categoria_meta,
        idioma:             form.idioma,
        cuerpo:             form.cuerpo,
        variables,
        tipo_header:        form.tipo_header,
        header_texto:       form.header_texto || null,
        header_contenido:   form.header_contenido || null,
        footer_texto:       form.footer_texto || null,
        meta_template_name: form.meta_template_name || null,
        botones:            form.botones,
        activa:             form.activa,
        updated_at:         new Date().toISOString(),
      }

      if (isNew) {
        const { data: creada, error } = await supabase.from('plantillas_mensajes').insert(data).select().single()
        if (error) throw error
        toast('Plantilla guardada como borrador')
        setIsNew(false)
        if (creada) setSelected(creada as Plantilla)
      } else if (selected) {
        const { error } = await supabase.from('plantillas_mensajes').update(data).eq('id', selected.id)
        if (error) throw error
        toast('Plantilla actualizada')
        setSelected(prev => prev ? { ...prev, ...data } as Plantilla : prev)
      }
      await cargar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al guardar', false)
    } finally {
      setSaving(false)
    }
  }

  const enviarAMeta = async () => {
    if (!selected) return
    setEnviando(true)
    setErrorMeta(null)
    try {
      const r = await fetch('/api/admin/mensajes/plantillas/enviar-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantilla_id: selected.id }),
      })
      const result = await r.json()
      if (!r.ok) {
        setErrorMeta(result.error ?? 'Error al enviar la plantilla a Meta')
        toast(result.error ?? 'Error al enviar la plantilla a Meta', false)
        return
      }
      toast('Plantilla enviada a Meta — quedó Pendiente de revisión')
      await cargar()
      const fresh = plantillas.find(p => p.id === selected.id)
      if (fresh) setSelected({ ...fresh, meta_status: result.meta_status, meta_template_id: result.meta_template_id })
    } catch {
      setErrorMeta('No se pudo conectar con Meta. Intenta de nuevo.')
      toast('No se pudo conectar con Meta', false)
    } finally {
      setEnviando(false)
    }
  }

  const eliminar = async () => {
    if (!confirmDelete) return
    setSaving(true)
    try {
      const r = await fetch('/api/admin/mensajes/plantillas/eliminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantilla_id: confirmDelete.id }),
      })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error ?? 'Error al eliminar')
      toast(result.avisoMeta ? `Eliminada. ${result.avisoMeta}` : 'Plantilla eliminada')
      if (selected?.id === confirmDelete.id) { setSelected(null); setIsNew(false) }
      setConfirmDelete(null)
      await cargar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error', false)
    } finally {
      setSaving(false)
    }
  }

  // Filtrar plantillas
  const plantillasFiltradas = useMemo(() =>
    plantillas.filter(p => {
      const matchCat = filterCat === 'todas' || p.categoria === filterCat
      const matchStatus = filterStatus === 'todas'
        || (filterStatus === 'pendiente' && (p.meta_status === 'pendiente' || p.meta_status === 'enviada_a_meta'))
        || p.meta_status === filterStatus
      const q = search.toLowerCase()
      const matchSearch = !q || p.nombre.toLowerCase().includes(q) || p.cuerpo.toLowerCase().includes(q)
      return matchCat && matchStatus && matchSearch
    }),
  [plantillas, filterCat, filterStatus, search])

  // Agrupar por categoría
  const agrupadas = useMemo(() => {
    const map = new Map<CategoriaKey, Plantilla[]>()
    plantillasFiltradas.forEach(p => {
      const arr = map.get(p.categoria) ?? []
      arr.push(p)
      map.set(p.categoria, arr)
    })
    return map
  }, [plantillasFiltradas])

  const previewRendered = renderPreview(form.cuerpo, previewVars)

  const agregarBoton = () => {
    if (form.botones.length >= 3) return
    setF('botones')([...form.botones, { type: 'QUICK_REPLY', text: '' }])
  }
  const actualizarBoton = (i: number, cambios: Partial<Boton>) => {
    setF('botones')(form.botones.map((b, idx) => idx === i ? { ...b, ...cambios } : b))
  }
  const quitarBoton = (i: number) => {
    setF('botones')(form.botones.filter((_, idx) => idx !== i))
  }

  return (
    <div className="flex h-full">
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg max-w-sm ${toastMsg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* ── Columna izquierda (lista) ──────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-bold text-gray-900">Plantillas</h1>
            {canEdit && (
              <button
                onClick={nuevaPlantilla}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Nueva
              </button>
            )}
          </div>

          {/* Filtro por status */}
          <div className="flex gap-1 flex-wrap mb-2">
            {FILTROS_STATUS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilterStatus(f.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterStatus === f.value ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plantilla..."
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          />
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value as CategoriaKey | 'todas')}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todas">Todas las categorías</option>
            {Object.entries(CATEGORIAS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : plantillas.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-3">Sin plantillas aún.</p>
              {canEdit && (
                <p className="text-xs text-gray-400">
                  Usa una de las plantillas predefinidas para empezar rápido.
                </p>
              )}
            </div>
          ) : agrupadas.size === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Sin resultados</p>
          ) : (
            Array.from(agrupadas.entries()).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1.5">
                  {CATEGORIAS[cat]}
                </p>
                <div className="space-y-1">
                  {items.map(p => {
                    const st = META_STATUS_LABELS[p.meta_status]
                    return (
                      <div
                        key={p.id}
                        className={`group rounded-lg transition-colors border ${
                          selected?.id === p.id ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-transparent'
                        }`}
                      >
                        <button onClick={() => selectPlantilla(p)} className="w-full text-left px-3 pt-2.5 pb-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium text-gray-900 leading-tight">{p.nombre}</span>
                            <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.cuerpo}</p>
                          {p.meta_status === 'rechazada' && p.meta_rechazo_motivo && (
                            <p className="text-xs text-red-600 mt-0.5 line-clamp-2">⚠ {p.meta_rechazo_motivo}</p>
                          )}
                        </button>
                        {canEdit && (
                          <div className="flex items-center gap-2 px-3 pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => duplicar(p)} className="text-[11px] text-gray-400 hover:text-blue-600">Duplicar</button>
                            <button onClick={() => setConfirmDelete(p)} className="text-[11px] text-gray-400 hover:text-red-600">Eliminar</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Plantillas predefinidas */}
        {plantillas.length === 0 && canEdit && (
          <div className="border-t p-3">
            <p className="text-xs font-semibold text-gray-500 mb-2 px-1">Plantillas predefinidas</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {PLANTILLAS_PREDEFINIDAS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => usarPredefinida(p)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <p className="text-xs font-medium text-blue-700">{p.nombre}</p>
                  <p className="text-xs text-gray-500">{CATEGORIAS[p.categoria]}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Columna derecha (editor) ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!selected && !isNew ? (
          /* Estado vacío */
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Selecciona una plantilla</h3>
            <p className="text-sm text-gray-500 max-w-xs">
              Haz clic en una plantilla de la lista o crea una nueva.
            </p>
            {canEdit && (
              <button
                onClick={nuevaPlantilla}
                className="mt-4 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 transition-colors"
              >
                Crear plantilla
              </button>
            )}
          </div>
        ) : (
          <div className="p-6 max-w-2xl mx-auto space-y-5">
            {/* Cabecera editor */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">
                  {isNew ? 'Nueva plantilla' : form.nombre}
                </h2>
                {selected && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${META_STATUS_LABELS[selected.meta_status].cls}`}>
                      {META_STATUS_LABELS[selected.meta_status].label}
                    </span>
                    {selected.meta_rechazo_motivo && (
                      <span className="text-xs text-red-600">Motivo: {selected.meta_rechazo_motivo}</span>
                    )}
                    {!puedeEditarContenido && (
                      <span className="text-xs text-gray-400">Meta no permite editar una plantilla en este estado — duplícala para crear una nueva versión.</span>
                    )}
                  </div>
                )}
              </div>
              {selected && canEdit && (
                <div className="flex gap-2 flex-shrink-0">
                  {(selected.meta_status === 'borrador' || selected.meta_status === 'rechazada') && (
                    <button
                      onClick={enviarAMeta}
                      disabled={enviando}
                      className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                    >
                      {enviando ? 'Enviando...' : 'Enviar a Meta'}
                    </button>
                  )}
                  <button
                    onClick={() => duplicar(selected)}
                    className="px-3 py-1.5 text-xs text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    Duplicar
                  </button>
                  <button
                    onClick={() => setConfirmDelete(selected)}
                    className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>

            {/* Error real de Meta, siempre visible (no genérico) */}
            {errorMeta && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                <p className="font-semibold mb-0.5">Meta rechazó la solicitud:</p>
                <p>{errorMeta}</p>
              </div>
            )}

            {/* Formulario */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input
                    value={form.nombre}
                    onChange={e => setF('nombre')(e.target.value)}
                    disabled={!puedeEditarContenido}
                    placeholder="Ej: Bienvenida cliente nuevo"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría (organización interna)</label>
                  <select
                    value={form.categoria}
                    onChange={e => setF('categoria')(e.target.value as CategoriaKey)}
                    disabled={!puedeEditarContenido}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  >
                    {Object.entries(CATEGORIAS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría de Meta</label>
                <select
                  value={form.categoria_meta}
                  onChange={e => setF('categoria_meta')(e.target.value as CategoriaMeta)}
                  disabled={!puedeEditarContenido}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                >
                  {Object.entries(CATEGORIAS_META).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1.5 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-2">
                  {CATEGORIA_META_AYUDA[form.categoria_meta]}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cuerpo del mensaje
                  <span className="ml-1 text-xs text-gray-400 font-normal">— usa {'{{'} {'}'} para variables</span>
                </label>
                <textarea
                  value={form.cuerpo}
                  onChange={e => setF('cuerpo')(e.target.value)}
                  disabled={!puedeEditarContenido}
                  rows={5}
                  placeholder="Hola {{nombre}}, gracias por contactarnos..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-50 resize-none"
                />
                {variablesDetectadas.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {variablesDetectadas.map(v => (
                      <span key={v} className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full font-mono">
                        {'{{'}{v}{'}}'}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Header</label>
                  <select
                    value={form.tipo_header}
                    onChange={e => setF('tipo_header')(e.target.value as TipoHeader)}
                    disabled={!puedeEditarContenido}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  >
                    <option value="ninguno">Sin header</option>
                    <option value="texto">Texto</option>
                    <option value="imagen">Imagen</option>
                    <option value="video">Video</option>
                    <option value="documento">Documento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
                  <select
                    value={form.idioma}
                    onChange={e => setF('idioma')(e.target.value)}
                    disabled={!puedeEditarContenido}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  >
                    {Object.entries(IDIOMAS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              {form.tipo_header === 'texto' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Texto del header</label>
                  <input
                    value={form.header_texto}
                    onChange={e => setF('header_texto')(e.target.value)}
                    disabled={!puedeEditarContenido}
                    placeholder="Título de la plantilla"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  />
                </div>
              )}
              {(form.tipo_header === 'imagen' || form.tipo_header === 'video' || form.tipo_header === 'documento') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Handle del media de Meta ({form.tipo_header})
                    <span className="ml-1 text-xs text-gray-400 font-normal">— sube el archivo por la Graph API y pega aquí el "handle" que te devuelve</span>
                  </label>
                  <input
                    value={form.header_contenido}
                    onChange={e => setF('header_contenido')(e.target.value)}
                    disabled={!puedeEditarContenido}
                    placeholder="ej: 4::aW1hZ2Uv..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-50"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Footer (opcional)</label>
                <input
                  value={form.footer_texto}
                  onChange={e => setF('footer_texto')(e.target.value)}
                  disabled={!puedeEditarContenido}
                  placeholder="Pie de mensaje, ej: 'No responder a este número'"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                />
              </div>

              {/* Botones */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Botones (opcional)</label>
                  {puedeEditarContenido && form.botones.length < 3 && (
                    <button onClick={agregarBoton} className="text-xs text-blue-700 font-semibold hover:text-blue-900">+ Agregar botón</button>
                  )}
                </div>
                {form.botones.length === 0 ? (
                  <p className="text-xs text-gray-400">Sin botones.</p>
                ) : (
                  <div className="space-y-2">
                    {form.botones.map((b, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                        <select
                          value={b.type}
                          onChange={e => actualizarBoton(i, { type: e.target.value as Boton['type'] })}
                          disabled={!puedeEditarContenido}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          <option value="QUICK_REPLY">Respuesta rápida</option>
                          <option value="URL">Ir a link</option>
                          <option value="PHONE_NUMBER">Llamar</option>
                        </select>
                        <input
                          value={b.text}
                          onChange={e => actualizarBoton(i, { text: e.target.value })}
                          disabled={!puedeEditarContenido}
                          placeholder="Texto del botón"
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                        {b.type === 'URL' && (
                          <input
                            value={b.url ?? ''}
                            onChange={e => actualizarBoton(i, { url: e.target.value })}
                            disabled={!puedeEditarContenido}
                            placeholder="https://..."
                            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          />
                        )}
                        {b.type === 'PHONE_NUMBER' && (
                          <input
                            value={b.phone_number ?? ''}
                            onChange={e => actualizarBoton(i, { phone_number: e.target.value })}
                            disabled={!puedeEditarContenido}
                            placeholder="+57..."
                            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          />
                        )}
                        {puedeEditarContenido && (
                          <button onClick={() => quitarBoton(i)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre en Meta (meta_template_name)
                  <span className="ml-1 text-xs text-gray-400 font-normal">— solo minúsculas y guiones bajos</span>
                </label>
                <input
                  value={form.meta_template_name}
                  onChange={e => setF('meta_template_name')(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  disabled={!puedeEditarContenido}
                  placeholder="bienvenida_nuevo_cliente"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-50"
                />
              </div>

              {canEdit && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.activa}
                    onChange={e => setF('activa')(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Plantilla activa</span>
                </label>
              )}
            </div>

            {/* Preview en vivo */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                <h3 className="font-medium text-gray-900 text-sm">Vista previa</h3>
                {variablesDetectadas.length > 0 && (
                  <span className="text-xs text-gray-500">Rellena las variables para previsualizar</span>
                )}
              </div>

              {/* Variables de preview */}
              {variablesDetectadas.length > 0 && (
                <div className="px-5 py-3 border-b bg-amber-50 grid grid-cols-2 gap-3">
                  {variablesDetectadas.map(v => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-yellow-700 w-24 flex-shrink-0">{'{{'}{v}{'}}'}</span>
                      <input
                        value={previewVars[v] ?? ''}
                        onChange={e => setPreviewVars(p => ({ ...p, [v]: e.target.value }))}
                        placeholder={v}
                        className="flex-1 border border-yellow-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400 bg-white"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Burbuja de chat simulada */}
              <div className="px-5 py-4 bg-[#e5ddd5]">
                <div className="max-w-[280px] ml-auto">
                  {form.tipo_header === 'texto' && form.header_texto && (
                    <div className="bg-white rounded-t-xl px-3 pt-2.5 pb-0 border-b border-gray-100">
                      <p className="font-bold text-gray-900 text-sm">{form.header_texto}</p>
                    </div>
                  )}
                  <div className={`bg-white px-3 py-2.5 shadow-sm ${form.tipo_header === 'texto' && form.header_texto ? 'rounded-b-xl' : 'rounded-xl'}`}>
                    <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
                      {highlightVariables(previewRendered)}
                    </p>
                    {form.footer_texto && (
                      <p className="text-xs text-gray-400 mt-1.5 pt-1.5 border-t border-gray-100">{form.footer_texto}</p>
                    )}
                    {form.botones.length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-1">
                        {form.botones.map((b, i) => (
                          <p key={i} className="text-xs text-blue-600 text-center">{b.text || '(botón sin texto)'}</p>
                        ))}
                      </div>
                    )}
                    <p className="text-right text-xs text-gray-400 mt-1">
                      {new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} ✓✓
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Botones guardar */}
            {canEdit && puedeEditarContenido && (
              <div className="flex gap-3 justify-end pb-6">
                <button
                  onClick={() => { setSelected(null); setIsNew(false) }}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={saving}
                  className="px-5 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Guardando...' : isNew ? 'Crear plantilla' : 'Guardar cambios'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal confirmar eliminar */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-gray-900 mb-2">¿Eliminar plantilla?</h3>
            <p className="text-sm text-gray-600 mb-5">
              Se eliminará permanentemente <strong>{confirmDelete.nombre}</strong>
              {confirmDelete.meta_template_id ? ' (también se eliminará en Meta).' : '.'} Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={eliminar} disabled={saving} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                {saving ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
