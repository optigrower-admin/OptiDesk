'use client'
import { useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

const TIPOS_DOCUMENTO = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'NIT', label: 'NIT' },
  { value: 'RC', label: 'Registro civil' },
  { value: 'PEP', label: 'Permiso especial de permanencia' },
]

const DOMINIOS_CORREO = ['gmail.com', 'hotmail.com', 'outlook.com']

function formatCelular(digits: string) {
  const d = digits.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

interface Props {
  onClose: () => void
  onCreated: (clienteId: string) => void
  /** 'modal' = overlay flotante sobre Ventas (PC). 'pantalla' = página completa (vista móvil). */
  variant?: 'modal' | 'pantalla'
}

/** Formulario para registrar un prospecto de venta nuevo (clientes gestionados
 * en persona, sin chat previo) — datos del cliente + un comentario/nota
 * inicial sobre él. Se usa como modal desde Ventas (PC) y como pantalla
 * completa desde la vista móvil de admin ("Registrar Prospecto Venta"). */
export default function NuevoClienteForm({ onClose, onCreated, variant = 'modal' }: Props) {
  const supabase = createClient()
  const [primerNombre, setPrimerNombre]       = useState('')
  const [segundoNombre, setSegundoNombre]     = useState('')
  const [primerApellido, setPrimerApellido]   = useState('')
  const [segundoApellido, setSegundoApellido] = useState('')
  const [tipoDocumento, setTipoDocumento]     = useState('CC')
  const [numeroDocumento, setNumeroDocumento] = useState('') // solo dígitos
  const [celular, setCelular]     = useState('') // solo dígitos
  const [email, setEmail]         = useState('')
  const [emailFocused, setEmailFocused] = useState(false)
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')

  // Detección de duplicados
  const [dupCelular, setDupCelular]       = useState<string | null>(null)
  const [dupDocumento, setDupDocumento]   = useState<string | null>(null)
  const [buscandoDup, setBuscandoDup]     = useState(false)

  const hayDuplicado = !!(dupCelular || dupDocumento)
  const valido = primerNombre.trim() !== '' && celular.trim() !== ''

  // Sugerencias de dominio de correo — solo si hay exactamente un "@" y el
  // usuario no ha terminado de escribir el dominio (sigue siendo opcional).
  const arrobaIdx = email.indexOf('@')
  const dominioEscrito = arrobaIdx >= 0 ? email.slice(arrobaIdx + 1) : ''
  const sugerenciasCorreo = arrobaIdx >= 0 && !dominioEscrito.includes('.')
    ? DOMINIOS_CORREO.filter(d => d.startsWith(dominioEscrito))
    : []
  const mostrarSugerencias = emailFocused && sugerenciasCorreo.length > 0

  async function verificarCelular(val: string) {
    if (!val.trim()) { setDupCelular(null); return }
    setBuscandoDup(true)
    const { data } = await supabase
      .from('clientes')
      .select('nombre')
      .eq('celular', val.trim())
      .limit(1)
      .maybeSingle()
    setDupCelular(data?.nombre ?? null)
    setBuscandoDup(false)
  }

  async function verificarDocumento(val: string) {
    if (!val.trim()) { setDupDocumento(null); return }
    setBuscandoDup(true)
    const { data } = await supabase
      .from('clientes')
      .select('nombre')
      .eq('cedula', val.trim())
      .limit(1)
      .maybeSingle()
    setDupDocumento(data?.nombre ?? null)
    setBuscandoDup(false)
  }

  async function crear() {
    if (!valido) return
    setGuardando(true); setError('')
    try {
      const res = await fetch('/api/admin/clientes/iniciar-seguimiento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primer_nombre: primerNombre.trim(),
          segundo_nombre: segundoNombre.trim() || null,
          primer_apellido: primerApellido.trim() || null,
          segundo_apellido: segundoApellido.trim() || null,
          tipo_documento: tipoDocumento,
          numero_documento: numeroDocumento || null,
          celular: celular.trim(),
          email: email.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al crear el cliente')

      if (comentario.trim()) {
        await fetch('/api/admin/mensajes/notas-cliente', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: json.cliente_id, contenido: comentario.trim() }),
        }).catch(() => {})
      }

      onCreated(json.cliente_id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al crear el cliente')
      setGuardando(false)
    }
  }

  const contenido = (
    <>
      <div className="px-5 overflow-y-auto flex-1 min-h-0">
        <div className="space-y-3 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Campo label="Primer nombre *">
              <input value={primerNombre} onChange={e => setPrimerNombre(e.target.value.toUpperCase())} placeholder="Ej: JUAN"
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Campo>
            <Campo label="Segundo nombre (opcional)">
              <input value={segundoNombre} onChange={e => setSegundoNombre(e.target.value.toUpperCase())} placeholder="Ej: CARLOS"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Campo label="Primer apellido (opcional)">
              <input value={primerApellido} onChange={e => setPrimerApellido(e.target.value.toUpperCase())} placeholder="Ej: PÉREZ"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Campo>
            <Campo label="Segundo apellido (opcional)">
              <input value={segundoApellido} onChange={e => setSegundoApellido(e.target.value.toUpperCase())} placeholder="Ej: GÓMEZ"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Campo>
          </div>
          <Campo label="Celular *">
            <input
              value={formatCelular(celular)}
              onChange={e => { setCelular(e.target.value.replace(/\D/g, '').slice(0, 10)); setDupCelular(null) }}
              onBlur={e => verificarCelular(e.target.value.replace(/\D/g, ''))}
              placeholder="(321) 313-2978"
              type="tel" inputMode="tel"
              className={`w-full border rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 ${
                dupCelular ? 'border-amber-400 focus:ring-amber-400 bg-amber-50' : 'border-gray-200 focus:ring-blue-500'
              }`}
            />
          </Campo>
          <div className="grid grid-cols-[auto,1fr] gap-2.5">
            <Campo label="Tipo doc.">
              <select value={tipoDocumento} onChange={e => setTipoDocumento(e.target.value)}
                className="border border-gray-200 rounded-xl px-2.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
              </select>
            </Campo>
            <Campo label="Número de documento (opcional)">
              <input
                value={numeroDocumento ? Number(numeroDocumento).toLocaleString('es-CO') : ''}
                onChange={e => { setNumeroDocumento(e.target.value.replace(/\D/g, '')); setDupDocumento(null) }}
                onBlur={e => verificarDocumento(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric" placeholder="Ej: 1.234.567"
                className={`w-full border rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 ${
                  dupDocumento ? 'border-amber-400 focus:ring-amber-400 bg-amber-50' : 'border-gray-200 focus:ring-blue-500'
                }`}
              />
            </Campo>
          </div>
          <Campo label="Correo electrónico (opcional)">
            <div className="relative">
              <input
                value={email}
                onChange={e => setEmail(e.target.value.toLowerCase())}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setTimeout(() => setEmailFocused(false), 150)}
                placeholder="correo@ejemplo.com"
                type="email" inputMode="email" autoCapitalize="none"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {mostrarSugerencias && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {sugerenciasCorreo.map(dominio => (
                    <button
                      key={dominio}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setEmail(`${email.slice(0, arrobaIdx)}@${dominio}`); setEmailFocused(false) }}
                      className="w-full text-left px-3.5 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      {email.slice(0, arrobaIdx)}@{dominio}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Campo>
          <Campo label="Comentario (opcional)">
            <textarea
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="Ej: interesado en la XR 250, quiere financiar a 24 meses..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </Campo>
        </div>

        {/* Avisos de duplicado */}
        {buscandoDup && <p className="text-xs text-gray-400 mt-1">Verificando duplicados...</p>}
        {dupCelular && (
          <div className="mt-3 bg-red-50 border border-red-300 rounded-xl px-3 py-2.5">
            <p className="text-xs font-bold text-red-700">🚫 Celular ya registrado</p>
            <p className="text-xs text-red-600 mt-0.5">
              El número <span className="font-semibold">{formatCelular(celular)}</span> ya pertenece a{' '}
              <span className="font-semibold">{dupCelular}</span>.
              No se puede crear un nuevo cliente con ese número.
            </p>
          </div>
        )}
        {dupDocumento && (
          <div className="mt-3 bg-red-50 border border-red-300 rounded-xl px-3 py-2.5">
            <p className="text-xs font-bold text-red-700">🚫 Cédula ya registrada</p>
            <p className="text-xs text-red-600 mt-0.5">
              La cédula <span className="font-semibold">{Number(numeroDocumento).toLocaleString('es-CO')}</span> ya pertenece a{' '}
              <span className="font-semibold">{dupDocumento}</span>.
              No se puede crear un nuevo cliente con esa cédula.
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-2">* Solo el primer nombre y el celular son obligatorios.</p>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      <div className="flex gap-2 px-5 pt-3 border-t border-gray-100 flex-shrink-0"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <button onClick={onClose} className="flex-1 py-3.5 border border-gray-200 text-gray-600 rounded-xl text-base font-medium hover:bg-gray-50">
          Cancelar
        </button>
        <button onClick={crear} disabled={!valido || guardando || hayDuplicado}
          className="flex-1 py-3.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-base font-semibold disabled:opacity-40 transition-colors">
          {guardando ? 'Creando...' : 'Crear'}
        </button>
      </div>
    </>
  )

  if (variant === 'pantalla') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0 bg-white border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 text-base">Nuevo prospecto de venta</h2>
            <p className="text-xs text-gray-500 mt-0.5">Para clientes que se gestionan en persona, sin chat previo.</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-2xl leading-none transition-colors">
            ×
          </button>
        </div>
        {contenido}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 text-base">Nuevo cliente en seguimiento</h2>
            <p className="text-xs text-gray-500 mt-0.5">Para clientes que se gestionan en persona, sin chat previo.</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-2xl leading-none transition-colors">
            ×
          </button>
        </div>
        {contenido}
      </div>
    </div>
  )
}
