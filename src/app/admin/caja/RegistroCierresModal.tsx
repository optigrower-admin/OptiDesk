'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'

interface SaldoCuenta { metodo_pago_id: string; nombre: string; saldo: number }
interface Cierre {
  id: string
  fecha: string
  saldos_por_cuenta: SaldoCuenta[]
  saldo_caja_fuerte: number
}

function formatFechaCierre(fechaYMD: string) {
  const d = new Date(fechaYMD + 'T00:00:00')
  const txt = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

export default function RegistroCierresModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const supabase = createClient()
  const [cierres, setCierres] = useState<Cierre[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('cierres_diarios_caja')
      .select('id, fecha, saldos_por_cuenta, saldo_caja_fuerte')
      .eq('tenant_id', tenantId)
      .order('fecha', { ascending: false })
      .limit(90)
      .then(({ data }) => { setCierres((data as Cierre[]) ?? []); setLoading(false) })
  }, [supabase, tenantId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Registro Cierres Diario</h2>
            <p className="text-xs text-gray-500 mt-0.5">Saldo de cada cuenta al cierre de cada día (11:45 p.m.)</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Cargando...
            </div>
          ) : cierres.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
              <span className="text-4xl">🌙</span>
              <p className="text-sm text-center">
                Aún no hay cierres registrados.<br />
                El primero se guardará hoy a las 11:45 p.m.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cierres.map(c => {
                const totalCuentas = c.saldos_por_cuenta.reduce((s, x) => s + x.saldo, 0)
                return (
                  <div key={c.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="font-semibold text-gray-900 text-sm">{formatFechaCierre(c.fecha)}</p>
                      <p className="text-xs text-gray-400">
                        Total: <span className="font-semibold text-gray-600">{formatCOP(totalCuentas + c.saldo_caja_fuerte)}</span>
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {c.saldos_por_cuenta.map(s => (
                        <div key={s.metodo_pago_id} className="bg-gray-50 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-gray-400 font-medium truncate">{s.nombre}</p>
                          <p className="text-sm font-mono font-semibold text-gray-800">{formatCOP(s.saldo)}</p>
                        </div>
                      ))}
                      <div className="bg-gray-100 rounded-lg px-3 py-2 border border-gray-200">
                        <p className="text-[10px] text-gray-500 font-medium">🔒 Caja fuerte</p>
                        <p className="text-sm font-mono font-semibold text-gray-800">{formatCOP(c.saldo_caja_fuerte)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
