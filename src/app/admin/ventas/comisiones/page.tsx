'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/ventas/pipeline'

interface Comision {
  id: string
  cilindrada_min: number
  cilindrada_max: number
  comision_valor: number
  orden: number
  updated_at: string
}

export default function ComisionesFreelancePage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [nombreNegocio, setNombreNegocio] = useState('')
  const [ahora, setAhora] = useState(new Date())
  const [comisiones, setComisiones] = useState<Comision[]>([])
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [valorEdit, setValorEdit] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('tenants').select('nombre_herramienta, nombre').eq('id', profile.tenant_id).single()
      .then(({ data }) => setNombreNegocio(data?.nombre_herramienta || data?.nombre || ''))
  }, [profile?.tenant_id])

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/ventas/comisiones')
    const result = await r.json()
    setComisiones(result.comisiones ?? [])
    setPuedeEditar(!!result.puedeEditar)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const iniciarEdicion = (c: Comision) => {
    setEditandoId(c.id)
    setValorEdit(String(c.comision_valor))
  }

  const guardar = async (id: string) => {
    const valor = parseFloat(valorEdit.replace(/\./g, '').replace(/,/g, '.'))
    if (isNaN(valor) || valor < 0) { alert('Ingresa un valor válido'); return }
    setGuardando(true)
    const r = await fetch('/api/admin/ventas/comisiones', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, comision_valor: valor }),
    })
    const result = await r.json()
    setGuardando(false)
    if (!r.ok) { alert(result.error ?? 'Error al guardar'); return }
    setEditandoId(null)
    await cargar()
  }

  const fechaFmt = ahora.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
  const horaFmt = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      {/* ── Encabezado ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 text-white p-6 sm:p-8 mb-6 shadow-lg">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -right-4 -bottom-16 w-52 h-52 rounded-full bg-white/5" />
        <div className="relative">
          <p className="text-xs font-semibold tracking-widest uppercase text-white/70">Comisiones Freelance</p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1">{nombreNegocio || 'Cargando...'}</h1>
          <div className="mt-4 inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            <span className="font-medium">Promociones vigentes</span>
            <span className="text-white/70">·</span>
            <span className="capitalize">{fechaFmt}</span>
            <span className="text-white/70">·</span>
            <span className="font-mono tabular-nums">{horaFmt}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Comisión por vehículo vendido</h2>
        {!puedeEditar && !loading && (
          <span className="text-[11px] text-gray-400">Solo gerencia puede editar estos valores</span>
        )}
      </div>

      {/* ── Tarjetas de comisión por cilindraje ── */}
      <div className="space-y-3">
        {loading && (
          <div className="text-center text-sm text-gray-400 py-10">Cargando comisiones...</div>
        )}
        {!loading && comisiones.map(c => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl flex-shrink-0">
                🏍️
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Cilindrada {c.cilindrada_min}cc a {c.cilindrada_max}cc
                </p>
                <p className="text-xs text-gray-400">Por cada vehículo vendido en este rango</p>
              </div>
            </div>

            {editandoId === c.id ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={valorEdit}
                  onChange={e => setValorEdit(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') guardar(c.id) }}
                  placeholder="120000"
                  className="w-32 px-3 py-1.5 border border-indigo-300 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <button onClick={() => guardar(c.id)} disabled={guardando}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                  {guardando ? '...' : 'Guardar'}
                </button>
                <button onClick={() => setEditandoId(null)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-lg font-bold text-indigo-600">{formatCOP(c.comision_valor)}</p>
                {puedeEditar && (
                  <button onClick={() => iniciarEdicion(c)} className="text-gray-400 hover:text-indigo-600 p-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400 text-center mt-6">
        Estos valores aplican por cada vehículo vendido por un freelancer, según el cilindraje del modelo.
      </p>
    </div>
  )
}
