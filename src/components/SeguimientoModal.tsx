'use client'
import { useState, useEffect, useRef } from 'react'

interface ClienteResultado {
  id: string
  nombre: string | null
  celular: string | null
  cedula: string | null
  numero_documento: string | null
  en_seguimiento_ventas: boolean
}
interface OrdenResultado {
  cliente: string
  telefono: string | null
  placa: string
}

interface Props {
  nombreInicial?: string
  celularInicial?: string
  onSuccess: (clienteId: string, nombre: string) => void
  onClose: () => void
}

export default function SeguimientoModal({ nombreInicial = '', celularInicial = '', onSuccess, onClose }: Props) {
  const [busqueda, setBusqueda]           = useState(celularInicial || nombreInicial)
  const [clientes, setClientes]           = useState<ClienteResultado[]>([])
  const [ordenes, setOrdenes]             = useState<OrdenResultado[]>([])
  const [buscando, setBuscando]           = useState(false)
  const [buscadoAlguna, setBuscadoAlguna] = useState(false)

  // Form crear nuevo
  const [modoCrear, setModoCrear]   = useState(false)
  const [primerNombre, setPrimerNombre] = useState(() => {
    const partes = nombreInicial.trim().split(' ')
    return partes[0] ?? ''
  })
  const [apellido, setApellido]     = useState(() => {
    const partes = nombreInicial.trim().split(' ')
    return partes.slice(1).join(' ')
  })
  const [celular, setCelular]       = useState(celularInicial)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')

  // Vincular existente
  const [vinculando, setVinculando] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (busqueda.length >= 2) buscar(busqueda)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleBusqueda(val: string) {
    setBusqueda(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.length < 2) { setClientes([]); setOrdenes([]); setBuscadoAlguna(false); return }
    debounceRef.current = setTimeout(() => buscar(val), 400)
  }

  async function buscar(q: string) {
    setBuscando(true)
    try {
      const res = await fetch(`/api/admin/clientes/buscar?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setClientes(json.clientes ?? [])
      setOrdenes(json.ordenes ?? [])
      setBuscadoAlguna(true)
    } finally {
      setBuscando(false)
    }
  }

  async function vincular(clienteId: string, nombre: string) {
    setVinculando(clienteId)
    const res = await fetch('/api/admin/ventas/guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId, en_seguimiento_ventas: true }),
    })
    setVinculando(null)
    if (res.ok) {
      onSuccess(clienteId, nombre)
    } else {
      setError('No se pudo vincular. Intenta de nuevo.')
    }
  }

  async function crear() {
    if (!primerNombre.trim() || !celular.trim()) {
      setError('Nombre y celular son obligatorios.')
      return
    }
    setGuardando(true)
    setError('')
    const res = await fetch('/api/admin/clientes/iniciar-seguimiento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primer_nombre: primerNombre.trim(),
        primer_apellido: apellido.trim() || null,
        celular: celular.trim(),
      }),
    })
    const json = await res.json()
    setGuardando(false)
    if (!res.ok) {
      setError(json.error ?? 'Error al crear el cliente.')
      return
    }
    onSuccess(json.cliente_id, `${primerNombre.trim()} ${apellido.trim()}`.trim())
  }

  const sinResultados = buscadoAlguna && clientes.length === 0 && ordenes.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-bold text-gray-900">Agregar a Seguimiento de Ventas</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Buscador */}
          <div>
            <label className="text-xs text-gray-500 font-medium mb-1 block">Buscar cliente existente</label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={busqueda}
                onChange={e => handleBusqueda(e.target.value)}
                placeholder="Nombre, celular, cédula o placa..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {buscando && <span className="text-xs text-gray-400 self-center">Buscando...</span>}
            </div>
          </div>

          {/* Resultados clientes */}
          {clientes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium">Clientes encontrados</p>
              {clientes.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 p-3 border border-gray-100 rounded-xl bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.nombre ?? '(sin nombre)'}</p>
                    <p className="text-xs text-gray-500">{c.celular ?? ''}{c.cedula ? ` · CC ${c.cedula}` : ''}{c.numero_documento && !c.cedula ? ` · Doc ${c.numero_documento}` : ''}</p>
                  </div>
                  {c.en_seguimiento_ventas ? (
                    <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">
                      ✓ Ya en seguimiento
                    </span>
                  ) : (
                    <button
                      onClick={() => vincular(c.id, c.nombre ?? '')}
                      disabled={vinculando === c.id}
                      className="text-xs font-semibold px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg disabled:opacity-50 whitespace-nowrap flex-shrink-0">
                      {vinculando === c.id ? 'Vinculando...' : 'Vincular'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Resultados por placa (desde ordenes) */}
          {ordenes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium">Encontrado por placa en órdenes</p>
              {ordenes.map((o, i) => (
                <div key={i} className="p-3 border border-orange-100 rounded-xl bg-orange-50">
                  <p className="text-xs text-orange-700 font-semibold mb-1">Placa {o.placa}</p>
                  <p className="text-sm text-gray-900 font-medium">{o.cliente}</p>
                  {o.telefono && <p className="text-xs text-gray-500">{o.telefono}</p>}
                  <button
                    onClick={() => handleBusqueda(o.telefono || o.cliente)}
                    className="mt-2 text-xs text-blue-700 hover:text-blue-900 font-medium underline">
                    Buscar por {o.telefono ? 'este celular' : 'este nombre'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Sin resultados */}
          {sinResultados && !modoCrear && (
            <div className="text-center py-3 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-500 mb-3">No se encontró ningún cliente con ese criterio.</p>
              <button
                onClick={() => {
                  setModoCrear(true)
                  // Intentar pre-llenar con la búsqueda actual
                  const q = busqueda.trim()
                  if (/^\d+$/.test(q.replace(/\s/g, ''))) {
                    setCelular(q)
                  } else if (q && !primerNombre) {
                    const partes = q.split(' ')
                    setPrimerNombre(partes[0])
                    setApellido(partes.slice(1).join(' '))
                  }
                }}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
                + Crear nuevo cliente
              </button>
            </div>
          )}

          {/* Botón crear cuando hay resultados también */}
          {buscadoAlguna && (clientes.length > 0 || ordenes.length > 0) && !modoCrear && (
            <button
              onClick={() => setModoCrear(true)}
              className="w-full text-xs text-blue-700 hover:text-blue-900 font-medium py-2 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50">
              No es ninguno de estos — crear nuevo cliente
            </button>
          )}

          {/* Formulario crear nuevo */}
          {modoCrear && (
            <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Nuevo cliente en Seguimiento</p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-0.5 block">Primer nombre *</label>
                  <input value={primerNombre} onChange={e => setPrimerNombre(e.target.value)}
                    placeholder="Juan"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-0.5 block">Apellido</label>
                  <input value={apellido} onChange={e => setApellido(e.target.value)}
                    placeholder="Pérez"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-0.5 block">Celular *</label>
                <input value={celular} onChange={e => setCelular(e.target.value)}
                  placeholder="3001234567"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <p className="text-xs text-gray-400">Si el celular ya existe en el sistema, se vinculará ese cliente en vez de duplicarlo.</p>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setModoCrear(false); setError('') }}
                  className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={crear} disabled={guardando || !primerNombre.trim() || !celular.trim()}
                  className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
                  {guardando ? 'Creando...' : 'Crear y agregar'}
                </button>
              </div>
            </div>
          )}

          {error && !modoCrear && <p className="text-xs text-red-600">{error}</p>}

          {/* Acceso rápido sin buscar */}
          {!buscadoAlguna && !modoCrear && (
            <button
              onClick={() => setModoCrear(true)}
              className="w-full text-xs text-gray-500 hover:text-blue-700 font-medium py-2 border border-dashed border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300">
              Crear nuevo sin buscar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
