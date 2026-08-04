'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registrarAuditoria } from '@/lib/audit'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
  onClienteUpdate?: (updates: { nombre?: string; celular?: string }) => void
}

const TIPOS_DOCUMENTO = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'NIT', label: 'NIT' },
  { value: 'RC', label: 'Registro civil' },
  { value: 'PEP', label: 'Permiso especial de permanencia' },
]

const TIPOS_CONTRATO = [
  { value: '', label: '— Sin especificar —' },
  { value: 'indefinido',    label: 'Empleado término indefinido' },
  { value: 'fijo',          label: 'Empleado término fijo' },
  { value: 'prestacion',    label: 'Prestación de servicios' },
  { value: 'obra_labor',    label: 'Obra o labor' },
  { value: 'independiente', label: 'Independiente / Cuenta propia' },
  { value: 'pensionado',    label: 'Pensionado / Jubilado' },
  { value: 'estudiante',    label: 'Estudiante' },
  { value: 'sin_contrato',  label: 'Sin contrato' },
  { value: 'otro',          label: 'Otro' },
]

type Campos = {
  primer_nombre: string
  segundo_nombre: string
  primer_apellido: string
  segundo_apellido: string
  tipo_documento: string
  cedula: string
  fecha_nacimiento: string
  email: string
  celular: string
  direccion: string
  municipio: string
  ciudad: string
  ocupacion: string
  tipo_contrato: string
  ingresos_mensuales: string
  gastos_mensuales: string
}

const VACIO: Campos = {
  primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '',
  tipo_documento: 'CC', cedula: '', fecha_nacimiento: '', email: '', celular: '', direccion: '', municipio: '', ciudad: '',
  ocupacion: '', tipo_contrato: '', ingresos_mensuales: '', gastos_mensuales: '',
}

function CopyButton({ value }: { value: string }) {
  const [copiado, setCopiado] = useState(false)
  if (!value) return null
  return (
    <button
      type="button"
      title="Copiar"
      onClick={() => { navigator.clipboard.writeText(value); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }}
      className="text-[10px] text-gray-400 hover:text-blue-600 transition-colors px-1"
    >
      {copiado ? '✓ Copiado' : '📋 Copiar'}
    </button>
  )
}

function Field({ label, value, onChange, onBlur, copyValue }: { label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; copyValue?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">{label}</label>
        <CopyButton value={copyValue !== undefined ? copyValue : value} />
      </div>
      <input value={value} onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
    </div>
  )
}

export default function DatosClienteTab({ clienteId, tenantId, usuarioId, onClienteUpdate }: Props) {
  const supabase = createClient()
  const [campos, setCampos]     = useState<Campos>(VACIO)
  const [original, setOriginal] = useState<Campos>(VACIO)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const camposRef               = useRef<Campos>(VACIO)

  useEffect(() => {
    supabase.from('clientes').select(Object.keys(VACIO).join(',')).eq('id', clienteId).single()
      .then(({ data, error }) => {
        if (error) console.error('DatosClienteTab select error:', error.message)
        const d = (data ?? {}) as Record<string, string | null>
        const c: Campos = { ...VACIO }
        for (const k of Object.keys(VACIO) as (keyof Campos)[]) c[k] = d[k] != null ? String(d[k]) : (k === 'tipo_documento' ? 'CC' : '')
        setCampos(c)
        setOriginal(c)
        camposRef.current = c
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  const NOMBRE_FIELDS: (keyof Campos)[] = ['primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido']

  function set<K extends keyof Campos>(k: K, v: string) {
    const transformed = NOMBRE_FIELDS.includes(k) ? v.toUpperCase()
      : k === 'email' ? v.toLowerCase()
      : v
    setCampos(p => {
      const next = { ...p, [k]: transformed }
      camposRef.current = next
      return next
    })
  }

  async function guardar() {
    const c = camposRef.current
    setSaving(true)
    try {
      const nombreCompleto = [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido]
        .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

      // Campos de texto: vacío → null (evita unique constraint violations en cedula/email)
      const NULLABLE_TEXT: (keyof Campos)[] = [
        'cedula', 'fecha_nacimiento', 'email', 'celular', 'direccion', 'municipio', 'ciudad',
        'ocupacion', 'tipo_contrato',
        'primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido',
      ]
      const update: Record<string, string | number | null> = {}
      for (const k of Object.keys(c) as (keyof Campos)[]) {
        if (NULLABLE_TEXT.includes(k)) {
          update[k] = c[k] || null
        } else {
          update[k] = c[k]  // tipo_documento siempre tiene valor
        }
      }
      if (nombreCompleto) update.nombre = nombreCompleto
      update.ingresos_mensuales = c.ingresos_mensuales ? parseInt(c.ingresos_mensuales, 10) : null
      update.gastos_mensuales   = c.gastos_mensuales   ? parseInt(c.gastos_mensuales,   10) : null

      const { error } = await supabase.from('clientes').update(update).eq('id', clienteId)
      if (error) throw new Error(error.message)

      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'clientes',
        registro_id: clienteId,
        tipo: 'edicion',
        valor_anterior: original,
        valor_nuevo: c,
        descripcion: 'Actualizó los datos del cliente desde Seguimiento Ventas',
        usuario_id: usuarioId,
      })
      setOriginal(c)
      onClienteUpdate?.({ nombre: nombreCompleto || undefined, celular: c.celular || undefined })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('guardar error:', msg)
      setSaveError(msg)
      setTimeout(() => setSaveError(null), 6000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Identificación</p>
        {saving    && <span className="text-[10px] text-blue-400 font-medium">Guardando...</span>}
        {saveError && <span className="text-[10px] text-red-500 font-medium" title={saveError}>⚠ Error al guardar</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Primer nombre"   value={campos.primer_nombre}   onChange={v => set('primer_nombre', v)}   onBlur={guardar} />
        <Field label="Segundo nombre"  value={campos.segundo_nombre}  onChange={v => set('segundo_nombre', v)}  onBlur={guardar} />
        <Field label="Primer apellido" value={campos.primer_apellido} onChange={v => set('primer_apellido', v)} onBlur={guardar} />
        <Field label="Segundo apellido" value={campos.segundo_apellido} onChange={v => set('segundo_apellido', v)} onBlur={guardar} />
      </div>
      <div className="grid grid-cols-[auto,1fr] gap-2">
        <div>
          <label className="text-xs text-gray-500">Tipo doc.</label>
          <select value={campos.tipo_documento} onChange={e => set('tipo_documento', e.target.value)} onBlur={guardar}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5">
            {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Número de documento</label>
            <CopyButton value={campos.cedula} />
          </div>
          <input
            value={campos.cedula.replace(/\D/g, '') ? Number(campos.cedula.replace(/\D/g, '')).toLocaleString('es-CO') : campos.cedula}
            onChange={e => set('cedula', e.target.value.replace(/\D/g, ''))}
            onBlur={guardar}
            inputMode="numeric"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-500">Fecha de nacimiento</label>
          <CopyButton value={campos.fecha_nacimiento} />
        </div>
        <input type="date" value={campos.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} onBlur={guardar}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Celular" value={campos.celular} onChange={v => set('celular', v)} onBlur={guardar} />
        <Field label="Correo electrónico" value={campos.email} onChange={v => set('email', v)} onBlur={guardar} />
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Ubicación</p>
      <Field label="Dirección" value={campos.direccion} onChange={v => set('direccion', v)} onBlur={guardar} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Municipio" value={campos.municipio} onChange={v => set('municipio', v)} onBlur={guardar} />
        <Field label="Ciudad / Pueblo" value={campos.ciudad} onChange={v => set('ciudad', v)} onBlur={guardar} />
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Información financiera</p>
      <Field label="Ocupación" value={campos.ocupacion} onChange={v => set('ocupacion', v)} onBlur={guardar} />
      <div>
        <label className="text-xs text-gray-500">Tipo de contrato</label>
        <select value={campos.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value)} onBlur={guardar}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5">
          {TIPOS_CONTRATO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Ingresos mensuales ($)</label>
            <CopyButton value={campos.ingresos_mensuales} />
          </div>
          <input
            value={campos.ingresos_mensuales ? Number(campos.ingresos_mensuales).toLocaleString('es-CO') : ''}
            onChange={e => set('ingresos_mensuales', e.target.value.replace(/\D/g, ''))}
            onBlur={guardar}
            inputMode="numeric"
            placeholder="Ej: 2.000.000"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Gastos mensuales ($)</label>
            <CopyButton value={campos.gastos_mensuales} />
          </div>
          <input
            value={campos.gastos_mensuales ? Number(campos.gastos_mensuales).toLocaleString('es-CO') : ''}
            onChange={e => set('gastos_mensuales', e.target.value.replace(/\D/g, ''))}
            onBlur={guardar}
            inputMode="numeric"
            placeholder="Ej: 800.000"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
        </div>
      </div>
    </div>
  )
}
