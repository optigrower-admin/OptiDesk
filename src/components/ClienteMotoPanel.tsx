'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizarPlaca } from '@/lib/utils'
import type { MotoExtras } from '@/lib/clienteMoto'

export interface ClienteMotoPanelResult {
  motoId: string | null
  clienteId: string | null
  motoExtras: MotoExtras
  isKnownMoto: boolean
}

interface ClienteRow {
  id: string
  nombre: string
  cedula: string | null
  celular: string | null
}

interface MotoRow {
  id: string
  marca: string | null
  modelo: string | null
  año: number | null
  color: string | null
  cliente_id: string | null
  clientes: ClienteRow | null
}

interface Props {
  tenantId: string
  placa: string
  cedula?: string
  onAutoFill?: (data: { nombre?: string; cedula?: string; celular?: string }) => void
  onResult: (result: ClienteMotoPanelResult) => void
}

const EMPTY_EXTRAS: MotoExtras = { marca: '', modelo: '', año: '', color: '' }

export function ClienteMotoPanel({ tenantId, placa, cedula, onAutoFill, onResult }: Props) {
  const supabase = createClient()

  const [moto, setMoto] = useState<MotoRow | null>(null)
  const [motoNotFound, setMotoNotFound] = useState(false)
  const [loadingMoto, setLoadingMoto] = useState(false)

  const [clienteFound, setClienteFound] = useState<ClienteRow | null>(null)
  const [loadingCliente, setLoadingCliente] = useState(false)

  const [extras, setExtras] = useState<MotoExtras>(EMPTY_EXTRAS)

  const onResultRef = useRef(onResult)
  const onAutoFillRef = useRef(onAutoFill)
  useEffect(() => { onResultRef.current = onResult })
  useEffect(() => { onAutoFillRef.current = onAutoFill })

  const motoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cedulaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Emit result on state changes
  useEffect(() => {
    onResultRef.current({
      motoId: moto?.id ?? null,
      clienteId: moto?.cliente_id ?? clienteFound?.id ?? null,
      motoExtras: extras,
      isKnownMoto: !!moto,
    })
  }, [moto, clienteFound, extras])

  // Placa lookup
  useEffect(() => {
    const norm = normalizarPlaca(placa)
    if (norm.length < 3) {
      setMoto(null)
      setMotoNotFound(false)
      return
    }
    if (motoTimer.current) clearTimeout(motoTimer.current)
    motoTimer.current = setTimeout(async () => {
      setLoadingMoto(true)
      const { data } = await supabase
        .from('motos')
        .select('id, marca, modelo, año, color, cliente_id, clientes:cliente_id(id, nombre, cedula, celular)')
        .eq('tenant_id', tenantId)
        .eq('placa', norm)
        .maybeSingle()

      if (data) {
        const m = data as unknown as MotoRow
        setMoto(m)
        setMotoNotFound(false)
        setExtras(EMPTY_EXTRAS)
        if (m.clientes) {
          onAutoFillRef.current?.({
            nombre: m.clientes.nombre,
            cedula: m.clientes.cedula ?? undefined,
            celular: m.clientes.celular ?? undefined,
          })
        }
      } else {
        setMoto(null)
        setMotoNotFound(true)
      }
      setLoadingMoto(false)
    }, 500)
    return () => { if (motoTimer.current) clearTimeout(motoTimer.current) }
  }, [placa, tenantId])

  // Cedula lookup (solo formularios admin)
  useEffect(() => {
    if (!cedula || cedula.length < 5) { setClienteFound(null); return }
    if (cedulaTimer.current) clearTimeout(cedulaTimer.current)
    cedulaTimer.current = setTimeout(async () => {
      setLoadingCliente(true)
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, cedula, celular')
        .eq('tenant_id', tenantId)
        .eq('cedula', cedula)
        .maybeSingle()

      if (data) {
        const c = data as ClienteRow
        setClienteFound(c)
        // Solo auto-rellenar si no viene ya del moto lookup
        if (!moto?.clientes) {
          onAutoFillRef.current?.({ nombre: c.nombre, celular: c.celular ?? undefined })
        }
      } else {
        setClienteFound(null)
      }
      setLoadingCliente(false)
    }, 500)
    return () => { if (cedulaTimer.current) clearTimeout(cedulaTimer.current) }
  }, [cedula, tenantId])

  const norm = normalizarPlaca(placa)
  if (norm.length < 3) return null

  return (
    <div className="space-y-2">
      {/* ── Moto loading ── */}
      {loadingMoto && (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
          <div className="w-3 h-3 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
          Buscando moto registrada...
        </div>
      )}

      {/* ── Moto encontrada ── */}
      {!loadingMoto && moto && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Moto registrada</p>
              {(moto.marca || moto.modelo) ? (
                <p className="text-sm font-semibold text-blue-900 mt-0.5">
                  {[moto.marca, moto.modelo].filter(Boolean).join(' ')}
                  {moto.año ? ` ${moto.año}` : ''}
                  {moto.color ? ` · ${moto.color}` : ''}
                </p>
              ) : (
                <p className="text-xs text-blue-500 italic mt-0.5">Sin datos del vehículo</p>
              )}
              {moto.clientes && (
                <p className="text-xs text-blue-700 mt-1.5 pt-1.5 border-t border-blue-200">
                  Cliente: <span className="font-semibold">{moto.clientes.nombre}</span>
                  {moto.clientes.cedula ? ` · CC ${moto.clientes.cedula}` : ''}
                  {moto.clientes.celular ? ` · ${moto.clientes.celular}` : ''}
                </p>
              )}
            </div>
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      )}

      {/* ── Moto nueva ── */}
      {!loadingMoto && motoNotFound && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold">Moto nueva</span>
            <span className="text-xs text-amber-700">Primera vez en el taller — datos opcionales</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'marca' as const, placeholder: 'Marca (ej: Honda)' },
              { key: 'modelo' as const, placeholder: 'Modelo (ej: CB 125)' },
              { key: 'año' as const, placeholder: 'Año (ej: 2022)' },
              { key: 'color' as const, placeholder: 'Color' },
            ]).map((f) => (
              <input
                key={f.key}
                type={f.key === 'año' ? 'number' : 'text'}
                value={extras[f.key]}
                onChange={(e) => setExtras((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                min={f.key === 'año' ? 1990 : undefined}
                max={f.key === 'año' ? 2030 : undefined}
                className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Cliente por cédula ── */}
      {loadingCliente && (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
          <div className="w-3 h-3 rounded-full border-2 border-gray-200 border-t-green-500 animate-spin" />
          Buscando cliente...
        </div>
      )}
      {!loadingCliente && clienteFound && !moto?.clientes && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Cliente registrado</p>
            <p className="text-sm font-semibold text-green-900">{clienteFound.nombre}</p>
            {clienteFound.celular && <p className="text-xs text-green-700">{clienteFound.celular}</p>}
          </div>
          <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  )
}
