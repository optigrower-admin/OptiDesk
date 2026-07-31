'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

type Comparado = { actual: number; anterior: number }
type Metricas = {
  tiempoRespuestaMin: Comparado
  tasaConversion: Comparado
  cicloVentaDias: Comparado
  mensajesAutomatizados: Comparado
  mensajesManuales: Comparado
  horasAhorradasEst: Comparado
  flujosCompletados: Comparado
  ordenTiempoPromedioHoras: Comparado
}

type Respuesta = {
  dias: number
  periodoActual: { desde: string; hasta: string }
  periodoAnterior: { desde: string; hasta: string }
  metricas: Metricas
}

function pctCambio(c: Comparado): number | null {
  if (c.anterior === 0) return c.actual === 0 ? 0 : null
  return ((c.actual - c.anterior) / c.anterior) * 100
}

function Tarjeta({
  titulo, valor, sufijo, comparado, menorEsMejor, nota,
}: {
  titulo: string
  valor: string
  sufijo?: string
  comparado: Comparado
  menorEsMejor: boolean
  nota?: string
}) {
  const cambio = pctCambio(comparado)
  const mejora = cambio === null ? null : menorEsMejor ? cambio < 0 : cambio > 0
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{valor}<span className="text-sm font-normal text-gray-400 ml-1">{sufijo}</span></p>
      {cambio !== null ? (
        <p className={`text-xs font-medium mt-1 ${mejora ? 'text-green-600' : mejora === false ? 'text-red-500' : 'text-gray-400'}`}>
          {mejora ? '▲' : mejora === false ? '▼' : '—'} {Math.abs(cambio).toFixed(0)}% vs período anterior
        </p>
      ) : (
        <p className="text-xs text-gray-400 mt-1">Sin datos del período anterior</p>
      )}
      {nota && <p className="text-[11px] text-gray-400 mt-1.5">{nota}</p>}
    </div>
  )
}

export default function ReportesPage() {
  const { profile } = useAuth()
  const [dias, setDias] = useState(30)
  const [data, setData] = useState<Respuesta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const esGerencia = profile?.rol === 'gerencia' || profile?.rol === 'dueno'

  const cargar = useCallback(async (d: number) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/admin/reportes/metricas?dias=${d}`)
      const result = await r.json()
      if (!r.ok) throw new Error(result.error ?? 'Error al cargar métricas')
      setData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar métricas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar(dias) }, [dias, cargar])

  if (!esGerencia) {
    return <div className="p-6 text-sm text-gray-500">Esta sección es solo para Gerencia/Dueño.</div>
  }

  const m = data?.metricas

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes — Impacto y eficiencia</h1>
          <p className="text-sm text-gray-500 mt-1">
            Comparación automática de este período contra el período inmediatamente anterior, calculada con tus propios datos (mensajes, ventas, servicio técnico y flujos).
          </p>
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {[30, 60, 90].map(d => (
            <button key={d} onClick={() => setDias(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                dias === d ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {d} días
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : m ? (
        <>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ventas</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Tarjeta
                titulo="Tiempo de primera respuesta"
                valor={m.tiempoRespuestaMin.actual ? m.tiempoRespuestaMin.actual.toFixed(0) : '—'}
                sufijo="min"
                comparado={m.tiempoRespuestaMin}
                menorEsMejor
                nota="Desde que escribe el cliente hasta la primera respuesta"
              />
              <Tarjeta
                titulo="Tasa de conversión de leads"
                valor={(m.tasaConversion.actual * 100).toFixed(0)}
                sufijo="%"
                comparado={{ actual: m.tasaConversion.actual * 100, anterior: m.tasaConversion.anterior * 100 }}
                menorEsMejor={false}
                nota="% de clientes nuevos del período que llegaron a Ganado"
              />
              <Tarjeta
                titulo="Ciclo de venta"
                valor={m.cicloVentaDias.actual ? m.cicloVentaDias.actual.toFixed(1) : '—'}
                sufijo="días"
                comparado={m.cicloVentaDias}
                menorEsMejor
                nota="Días promedio en la etapa previa a cerrar como Ganado"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Automatización</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Tarjeta
                titulo="Mensajes enviados por automatización"
                valor={String(m.mensajesAutomatizados.actual)}
                comparado={m.mensajesAutomatizados}
                menorEsMejor={false}
                nota="Flujos/bot, sin intervención manual"
              />
              <Tarjeta
                titulo="Horas ahorradas (estimado)"
                valor={m.horasAhorradasEst.actual.toFixed(1)}
                sufijo="h"
                comparado={m.horasAhorradasEst}
                menorEsMejor={false}
                nota="Estimado a 3 min por mensaje que ya no se escribió a mano"
              />
              <Tarjeta
                titulo="Flujos completados"
                valor={String(m.flujosCompletados.actual)}
                comparado={m.flujosCompletados}
                menorEsMejor={false}
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Servicio técnico</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Tarjeta
                titulo="Tiempo promedio por orden"
                valor={m.ordenTiempoPromedioHoras.actual ? m.ordenTiempoPromedioHoras.actual.toFixed(1) : '—'}
                sufijo="h"
                comparado={m.ordenTiempoPromedioHoras}
                menorEsMejor
                nota="Desde que entra la moto hasta que se finaliza la orden"
              />
            </div>
          </div>

          <p className="text-[11px] text-gray-400 pt-2">
            Métodos de cálculo aproximados, basados en los registros de tu propio tenant. No sustituyen una auditoría formal, pero sirven como evidencia real de progreso.
          </p>
        </>
      ) : null}
    </div>
  )
}
