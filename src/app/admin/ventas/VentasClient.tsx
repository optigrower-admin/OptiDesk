'use client'
import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ETAPAS_ACTIVAS } from '@/lib/ventas/pipeline'
import type { LeadData } from './components/LeadCard'
import PipelineKanban from './components/PipelineKanban'
import VistaHoy from './components/VistaHoy'
import VistaLista from './components/VistaLista'
import VistaBandeja from './VistaBandeja'
import { ImportadorExcel } from '@/components/ImportadorExcel'
import { importarSeguimientoVentas, previsualizarSeguimientoVentas } from '@/lib/bulkImport'

type Tab = 'kanban' | 'bandeja' | 'hoy' | 'lista'

interface Props {
  leadsIniciales: LeadData[]
  tenantId: string
}

type UsuarioFiltro = { id: string; nombre: string }

const TIPOS_DOCUMENTO = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'NIT', label: 'NIT' },
  { value: 'RC', label: 'Registro civil' },
  { value: 'PEP', label: 'Permiso especial de permanencia' },
]

function NuevoClienteModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient()
  const [primerNombre, setPrimerNombre]       = useState('')
  const [segundoNombre, setSegundoNombre]     = useState('')
  const [primerApellido, setPrimerApellido]   = useState('')
  const [segundoApellido, setSegundoApellido] = useState('')
  const [tipoDocumento, setTipoDocumento]     = useState('CC')
  const [numeroDocumento, setNumeroDocumento] = useState('') // solo dígitos
  const [celular, setCelular]     = useState('')
  const [email, setEmail]         = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')

  // Detección de duplicados
  const [dupCelular, setDupCelular]       = useState<string | null>(null)
  const [dupDocumento, setDupDocumento]   = useState<string | null>(null)
  const [buscandoDup, setBuscandoDup]     = useState(false)

  const hayDuplicado = !!(dupCelular || dupDocumento)
  const valido = primerNombre.trim() !== '' && celular.trim() !== ''

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
      window.location.reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al crear el cliente')
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-gray-900 mb-1">Nuevo cliente en seguimiento</h2>
        <p className="text-xs text-gray-500 mb-4">Para clientes que se gestionan en persona, sin chat previo.</p>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={primerNombre} onChange={e => setPrimerNombre(e.target.value)} placeholder="Primer nombre *"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={segundoNombre} onChange={e => setSegundoNombre(e.target.value)} placeholder="Segundo nombre (opcional)"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={primerApellido} onChange={e => setPrimerApellido(e.target.value)} placeholder="Primer apellido (opcional)"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={segundoApellido} onChange={e => setSegundoApellido(e.target.value)} placeholder="Segundo apellido (opcional)"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <input
            value={celular}
            onChange={e => { setCelular(e.target.value); setDupCelular(null) }}
            onBlur={e => verificarCelular(e.target.value)}
            placeholder="Celular *"
            className={`w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 ${
              dupCelular ? 'border-amber-400 focus:ring-amber-400 bg-amber-50' : 'border-gray-200 focus:ring-blue-500'
            }`}
          />
          <div className="grid grid-cols-[auto,1fr] gap-2">
            <select value={tipoDocumento} onChange={e => setTipoDocumento(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
            </select>
            <input
              value={numeroDocumento ? Number(numeroDocumento).toLocaleString('es-CO') : ''}
              onChange={e => { setNumeroDocumento(e.target.value.replace(/\D/g, '')); setDupDocumento(null) }}
              onBlur={e => verificarDocumento(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric" placeholder="Número de documento (opcional)"
              className={`w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 ${
                dupDocumento ? 'border-amber-400 focus:ring-amber-400 bg-amber-50' : 'border-gray-200 focus:ring-blue-500'
              }`}
            />
          </div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo electrónico (opcional)" type="email"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Avisos de duplicado */}
        {buscandoDup && <p className="text-xs text-gray-400 mt-2">Verificando duplicados...</p>}
        {dupCelular && (
          <div className="mt-3 bg-red-50 border border-red-300 rounded-xl px-3 py-2.5">
            <p className="text-xs font-bold text-red-700">🚫 Celular ya registrado</p>
            <p className="text-xs text-red-600 mt-0.5">
              El número <span className="font-semibold">{celular}</span> ya pertenece a{' '}
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
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={crear} disabled={!valido || guardando || hayDuplicado}
            className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors">
            {guardando ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VentasClient({ leadsIniciales, tenantId }: Props) {
  const { profile } = useAuth()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('kanban')
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [usuarios, setUsuarios] = useState<UsuarioFiltro[]>([])
  const [usuarioFiltro, setUsuarioFiltro] = useState<string | null>(null) // null = todos
  const [abrirClienteId, setAbrirClienteId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const abrir = params.get('abrir')
    if (abrir) {
      setAbrirClienteId(abrir)
      window.history.replaceState({}, '', '/admin/ventas')
    }
  }, [])

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('id, nombre, email')
      .eq('tenant_id', tenantId)
      .order('nombre')
      .then(({ data }) => {
        setUsuarios((data ?? []).map(u => ({
          id: u.id as string,
          nombre: (u.nombre as string | null) || (u.email as string | null) || 'Usuario',
        })))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const activos = useMemo(
    () => leadsIniciales.filter(l => ETAPAS_ACTIVAS.includes(l.etapa_venta as typeof ETAPAS_ACTIVAS[0])),
    [leadsIniciales]
  )

  const leadsFiltrados = useMemo(() => {
    let lista = usuarioFiltro ? leadsIniciales.filter(l => l.assigned_to === usuarioFiltro) : leadsIniciales
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      lista = lista.filter(l =>
        l.cliente?.nombre?.toLowerCase().includes(q) ||
        l.cliente?.celular?.includes(q) ||
        l.cliente_documento?.includes(q) ||
        l.cliente?.placa?.toLowerCase().includes(q) ||
        l.numero_factura?.toLowerCase().includes(q)
      )
    }
    return lista
  }, [leadsIniciales, usuarioFiltro, busqueda])

  const sinSeguim = activos.filter(l => !l.proxima_accion_fecha).length

  return (
    <div className="p-5">
      {nuevoOpen && <NuevoClienteModal onClose={() => setNuevoOpen(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Seguimiento Ventas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activos.length} clientes activos
            {sinSeguim > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                · ⚠️ {sinSeguim} sin seguimiento
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setNuevoOpen(true)}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
            + Nuevo cliente
          </button>

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {([
              { id: 'kanban',  label: 'Kanban' },
              { id: 'bandeja', label: '📥 Bandeja' },
              { id: 'hoy',     label: 'Hoy' },
              { id: 'lista',   label: 'Lista' },
            ] as { id: Tab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtro por usuario */}
      {tab !== 'bandeja' && usuarios.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Asesor:</span>
          <button
            onClick={() => setUsuarioFiltro(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
              usuarioFiltro === null
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
            }`}
          >
            Todos
          </button>
          {usuarios.map(u => (
            <button
              key={u.id}
              onClick={() => setUsuarioFiltro(u.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                usuarioFiltro === u.id
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
              }`}
            >
              {u.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Buscador */}
      {tab !== 'bandeja' && (
        <div className="mb-4">
          <div className="relative max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, cédula, celular, placa o factura..."
              className="w-full pl-8 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
                ×
              </button>
            )}
          </div>
          {busqueda.trim() && (
            <p className="text-xs text-gray-500 mt-1.5 ml-1">
              {leadsFiltrados.length === 0
                ? 'Sin resultados para esta búsqueda.'
                : `${leadsFiltrados.length} cliente${leadsFiltrados.length === 1 ? '' : 's'} encontrado${leadsFiltrados.length === 1 ? '' : 's'}`}
            </p>
          )}
        </div>
      )}

      {(profile?.rol === 'gerencia' || profile?.rol === 'admin') && (
        <div className="mb-4">
          <ImportadorExcel
            titulo="Carga masiva (Excel) — recuperar clientes de un caído de plataforma"
            descripcion="Cada fila es un cliente para Seguimiento Ventas. Si la cédula o el celular ya existen, se actualiza ese cliente en vez de duplicarlo."
            nombreArchivoPlantilla="plantilla_seguimiento_ventas.xlsx"
            encabezados={['Fecha (DD/MM/AAAA)', 'Primer nombre', 'Segundo nombre', 'Primer apellido', 'Segundo apellido', 'Tipo de documento (CC/TI/CE/PASAPORTE/NIT/RC/PEP)', 'Numero de documento', 'Celular', 'Email', 'Etapa (nuevo/con_interes/con_objecion/seguimiento/buscando_credito/calificado/demo/propuesta/negociacion/ganado/en_matricula/alistamiento/espera_entrega/entregada/perdido)', 'Valor estimado de venta', 'Proxima accion', 'Fecha proxima accion (DD/MM/AAAA)']}
            obligatoriedad={['no', 'si', 'no', 'si', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no']}
            filasEjemplo={[
              ['15/03/2025', 'Juan', '', 'Pérez', '', 'CC', '1020304050', '3001234567', 'juan@correo.com', 'calificado', '8000000', 'Llamar para agendar demo', '20/03/2025'],
            ]}
            notas={[
              'Una fila = un cliente.',
              'Tipo de documento: CC, TI, CE, PASAPORTE, NIT, RC o PEP. Si lo dejas vacío se usa CC.',
              'Etapa: si la dejas vacía se usa "nuevo".',
              'Si el Número de documento o el Celular ya existen en el sistema, se actualiza ese cliente con los datos de la fila en vez de crear uno nuevo.',
              'El cliente queda marcado automáticamente para aparecer en Seguimiento Ventas.',
            ]}
            vistaPrevia={previsualizarSeguimientoVentas}
            procesarFilas={(filas) => importarSeguimientoVentas(supabase, tenantId, profile!.id, filas)}
            onCompletado={() => window.location.reload()}
          />
        </div>
      )}

      {/* Content */}
      {tab === 'kanban' && (
        <PipelineKanban leadsIniciales={leadsFiltrados} tenantId={tenantId} usuarios={usuarios} abrirClienteId={abrirClienteId ?? undefined} />
      )}
      {tab === 'bandeja' && (
        <VistaBandeja leads={leadsIniciales} tenantId={tenantId} usuarios={usuarios} />
      )}
      {tab === 'hoy' && (
        <VistaHoy leads={leadsFiltrados} tenantId={tenantId} />
      )}
      {tab === 'lista' && (
        <VistaLista leads={leadsFiltrados} tenantId={tenantId} />
      )}
    </div>
  )
}
