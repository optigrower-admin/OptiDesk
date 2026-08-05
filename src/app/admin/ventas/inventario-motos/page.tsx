'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface InventarioRow {
  id: string
  moto_catalogo_id: string
  referencia: string
  cantidad_total: number
  comprometidas: number
  para_entregar: number
  entregadas: number
  disponibles: number
}

export default function InventarioMotosPage() {
  const [filas, setFilas] = useState<InventarioRow[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = () => {
    setLoading(true)
    fetch('/api/admin/ventas/inventario')
      .then(r => r.json())
      .then(d => setFilas(d.inventario ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [])

  const totales = filas.reduce((s, f) => ({
    disponibles: s.disponibles + f.disponibles,
    comprometidas: s.comprometidas + f.comprometidas,
    para_entregar: s.para_entregar + f.para_entregar,
  }), { disponibles: 0, comprometidas: 0, para_entregar: 0 })

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventario de motos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Disponibles, comprometidas y para entregar, según el pipeline de ventas en vivo</p>
        </div>
        <Link href="/admin/config-ventas" className="text-xs font-medium text-blue-600 hover:underline">
          Editar cantidades en Config Ventas →
        </Link>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400">Cargando...</div>
      ) : filas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">
          Todavía no hay motos en el inventario. Agrégalas desde <Link href="/admin/config-ventas" className="text-blue-600 hover:underline">Config Ventas</Link>.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Moto</th>
                  <th className="px-4 py-3 text-right">Disponibles</th>
                  <th className="px-4 py-3 text-right">Comprometidas</th>
                  <th className="px-4 py-3 text-right">Para entregar</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-800">{f.referencia}</td>
                    <td className={`px-4 py-3 text-right font-bold ${f.disponibles > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{f.disponibles}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{f.comprometidas}</td>
                    <td className="px-4 py-3 text-right text-blue-700">{f.para_entregar}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{f.cantidad_total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-gray-600">Total</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{totales.disponibles}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{totales.comprometidas}</td>
                  <td className="px-4 py-3 text-right text-blue-700">{totales.para_entregar}</td>
                  <td className="px-4 py-3 text-right text-gray-400">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 px-4 py-2 border-t border-gray-50">
            Comprometidas: en Vendida/Carta Aprobación hasta antes de En matrícula · Para entregar: En matrícula hasta antes de Entregada · las Entregadas ya se descontaron del total.
          </p>
        </div>
      )}
    </div>
  )
}
