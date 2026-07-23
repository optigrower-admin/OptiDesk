'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

const RUTA_SECCION: [string, string][] = [
  ['/admin/ventas',                'ventas'],
  ['/admin/ordenes',               'ordenes'],
  ['/admin/repuestos',             'repuestos'],
  ['/admin/caja',                  'caja'],
  ['/admin/clientes',              'clientes'],
  ['/admin/inventario',            'inventario'],
  ['/admin/mensajes',              'mensajes'],
  ['/admin/reportes',              'reportes'],
  ['/admin/cotizaciones-servtec',  'cotizaciones'],
  ['/admin/lista-precios',         'lista_precios'],
]

function getSeccion(pathname: string): string | null {
  for (const [ruta, sec] of RUTA_SECCION) {
    if (pathname.startsWith(ruta)) return sec
  }
  return null
}

export default function ManualButton() {
  const pathname = usePathname()
  const [seccion, setSeccion]   = useState<string | null>(null)
  const [visible, setVisible]   = useState(false)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    const sec = getSeccion(pathname)
    setSeccion(sec)
    setVisible(false)
    if (!sec) return

    let cancelled = false
    fetch(`/api/admin/config-general/url?seccion=${sec}`)
      .then(r => { if (!cancelled) setVisible(r.ok) })
      .catch(() => { if (!cancelled) setVisible(false) })
    return () => { cancelled = true }
  }, [pathname])

  if (!visible || !seccion) return null

  async function abrir() {
    if (loading || !seccion) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/config-general/url?seccion=${seccion}`)
      if (res.ok) {
        const { url } = await res.json()
        window.open(url, '_blank', 'noopener')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={abrir}
      disabled={loading}
      title="Ver manual / documentación de esta sección"
      className="fixed top-[54px] right-3 md:top-3 z-30 print:hidden flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg transition-all disabled:opacity-60 select-none"
    >
      {loading
        ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
        : <span>📖</span>
      }
      Manual
    </button>
  )
}
