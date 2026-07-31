'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { CATALOGO, CATEGORIA_INFO, type CatalogItem } from '../nodeCatalog'
import type { CategoriaNodo } from '@/types/flujos'

const CONTENIDO: CategoriaNodo[] = ['contenido']
const GRUPOS_ACCIONES: { titulo: string; categorias: CategoriaNodo[] }[] = [
  { titulo: 'IA', categorias: ['ia'] },
  { titulo: 'Conversación', categorias: ['captura', 'conversacion'] },
  { titulo: 'Lógica', categorias: ['logica'] },
  { titulo: 'Estructura', categorias: ['estructura'] },
]

export default function AddNodeMenu({ onSelect, label = '+ Añadir' }: { onSelect: (item: CatalogItem) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set(['IA', 'Conversación', 'Lógica', 'Estructura']))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtro = busqueda.trim().toLowerCase()
  const filtrado = useMemo(
    () => filtro
      ? CATALOGO.filter(c => c.label.toLowerCase().includes(filtro) || c.descripcionCorta.toLowerCase().includes(filtro))
      : null,
    [filtro],
  )

  const toggleGrupo = (titulo: string) => setAbiertos(s => {
    const next = new Set(s)
    if (next.has(titulo)) next.delete(titulo); else next.add(titulo)
    return next
  })

  const elegir = (item: CatalogItem) => { onSelect(item); setOpen(false); setBusqueda('') }

  const Fila = ({ item }: { item: CatalogItem }) => {
    const info = CATEGORIA_INFO[item.categoria]
    return (
      <button
        onClick={() => elegir(item)}
        className="w-full flex items-start gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 text-left transition-colors"
      >
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${info.bg} ${info.text}`}>{item.icono}</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-800 truncate">{item.label}</p>
          <p className="text-[10px] text-gray-400 truncate">{item.descripcionCorta}</p>
        </div>
      </button>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="px-3 py-1.5 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
      >
        {label}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl max-h-96 overflow-y-auto">
          <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
            <input
              autoFocus
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar acción o contenido..."
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {filtrado ? (
            <div className="p-1.5">
              {filtrado.length === 0
                ? <p className="text-xs text-gray-400 text-center py-4">Sin resultados</p>
                : filtrado.map((item, i) => <Fila key={`${item.tipo}-${item.categoriaAccion ?? ''}-${i}`} item={item} />)}
            </div>
          ) : (
            <>
              <div className="p-1.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-1.5 py-1">Contenido</p>
                {CATALOGO.filter(c => CONTENIDO.includes(c.categoria)).map((item, i) => <Fila key={`${item.tipo}-${i}`} item={item} />)}
              </div>
              {GRUPOS_ACCIONES.map(grupo => {
                const items = CATALOGO.filter(c => grupo.categorias.includes(c.categoria))
                if (!items.length) return null
                const abierto = abiertos.has(grupo.titulo)
                return (
                  <div key={grupo.titulo} className="border-t border-gray-100 p-1.5">
                    <button
                      onClick={() => toggleGrupo(grupo.titulo)}
                      className="w-full flex items-center justify-between px-1.5 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide"
                    >
                      {grupo.titulo}
                      <span>{abierto ? '▾' : '▸'}</span>
                    </button>
                    {abierto && items.map((item, i) => <Fila key={`${item.tipo}-${item.categoriaAccion ?? ''}-${i}`} item={item} />)}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
