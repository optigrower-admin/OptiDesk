'use client'
import { useRef, useState } from 'react'
import { VARIABLES_CORREO, normalizarVariable, partirTextoEnVariables } from '@/lib/ventas/variablesCorreo'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  className?: string
}

// Campo de texto para asunto/cuerpo de plantillas de correo: al escribir "{{"
// aparece un menú con las variables disponibles (Nombre, Placa, etc.) — al
// elegir una se inserta como {Variable} (llave simple, que es lo que de
// verdad reconoce el sistema al enviar el correo). Debajo se muestra una
// vista previa con las variables reconocidas resaltadas en azul, para que
// quede claro qué sí se va a reemplazar por el dato real de cada cliente.
export default function CampoVariablesCorreo({ value, onChange, placeholder, multiline, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [inicioLlaves, setInicioLlaves] = useState<number | null>(null)

  function detectarTrigger(texto: string, cursor: number) {
    const antes = texto.slice(0, cursor)
    const idx = antes.lastIndexOf('{{')
    if (idx === -1) { setMenuAbierto(false); return }
    const tramo = antes.slice(idx + 2)
    // Si ya se cerró con "}" antes del cursor, o hay un salto de línea/espacio
    // de más, ya no es un trigger activo.
    if (tramo.includes('}') || tramo.includes('\n')) { setMenuAbierto(false); return }
    setInicioLlaves(idx)
    setFiltro(tramo)
    setMenuAbierto(true)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const texto = e.target.value
    onChange(texto)
    detectarTrigger(texto, e.target.selectionStart ?? texto.length)
  }

  function insertarVariable(clave: string) {
    if (inicioLlaves === null) return
    const el = multiline ? textareaRef.current : inputRef.current
    const cursor = el?.selectionStart ?? value.length
    const nuevo = `${value.slice(0, inicioLlaves)}{${clave}}${value.slice(cursor)}`
    onChange(nuevo)
    setMenuAbierto(false)
    const nuevaPos = inicioLlaves + clave.length + 2
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(nuevaPos, nuevaPos)
    })
  }

  const variablesFiltradas = VARIABLES_CORREO.filter(v =>
    !filtro || normalizarVariable(v.clave).includes(normalizarVariable(filtro))
  )

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={e => { if (e.key === 'Escape') setMenuAbierto(false) }}
          onBlur={() => setTimeout(() => setMenuAbierto(false), 150)}
          placeholder={placeholder}
          rows={3}
          className={className}
        />
      ) : (
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={e => { if (e.key === 'Escape') setMenuAbierto(false) }}
          onBlur={() => setTimeout(() => setMenuAbierto(false), 150)}
          placeholder={placeholder}
          className={className}
        />
      )}

      {menuAbierto && variablesFiltradas.length > 0 && (
        <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg py-1 max-h-56 overflow-y-auto">
          {variablesFiltradas.map(v => (
            <button
              key={v.clave}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => insertarVariable(v.clave)}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 transition-colors"
            >
              <span className="text-sm font-semibold text-blue-700">{`{${v.clave}}`}</span>
              <span className="block text-[11px] text-gray-400">{v.label}</span>
            </button>
          ))}
        </div>
      )}

      {value && (
        <p className="text-xs text-gray-500 mt-1 leading-relaxed whitespace-pre-wrap">
          {partirTextoEnVariables(value).map((tramo, i) =>
            !tramo.variable ? (
              <span key={i}>{tramo.texto}</span>
            ) : (
              <span key={i} className={tramo.reconocida ? 'font-semibold text-blue-700' : 'font-semibold text-red-500'} title={tramo.reconocida ? undefined : 'Variable no reconocida'}>
                {tramo.texto}
              </span>
            )
          )}
        </p>
      )}
    </div>
  )
}
