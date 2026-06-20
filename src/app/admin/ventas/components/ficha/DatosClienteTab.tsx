'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registrarAuditoria } from '@/lib/audit'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
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

type Campos = {
  primer_nombre: string
  segundo_nombre: string
  primer_apellido: string
  segundo_apellido: string
  tipo_documento: string
  cedula: string
  email: string
  celular: string
  direccion: string
  municipio: string
  ciudad: string
  descuentos: string
  lugar_matricula: string
}

const VACIO: Campos = {
  primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '',
  tipo_documento: 'CC', cedula: '', email: '', celular: '', direccion: '', municipio: '', ciudad: '',
  descuentos: '', lugar_matricula: '',
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
    </div>
  )
}

export default function DatosClienteTab({ clienteId, tenantId, usuarioId }: Props) {
  const supabase = createClient()
  const [campos, setCampos]   = useState<Campos>(VACIO)
  const [original, setOriginal] = useState<Campos>(VACIO)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    supabase.from('clientes').select(Object.keys(VACIO).join(',')).eq('id', clienteId).single()
      .then(({ data }) => {
        const d = (data ?? {}) as Record<string, string | null>
        const c: Campos = { ...VACIO }
        for (const k of Object.keys(VACIO) as (keyof Campos)[]) c[k] = d[k] ?? (k === 'tipo_documento' ? 'CC' : '')
        setCampos(c)
        setOriginal(c)
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  function set<K extends keyof Campos>(k: K, v: string) {
    setCampos(p => ({ ...p, [k]: v }))
  }

  async function guardar() {
    setSaving(true)
    try {
      const nombreCompleto = [campos.primer_nombre, campos.segundo_nombre, campos.primer_apellido, campos.segundo_apellido]
        .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

      const update: Record<string, string | null> = { ...campos }
      if (nombreCompleto) update.nombre = nombreCompleto

      const { error } = await supabase.from('clientes').update(update).eq('id', clienteId)
      if (error) throw new Error(error.message)

      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'clientes',
        registro_id: clienteId,
        tipo: 'edicion',
        valor_anterior: original,
        valor_nuevo: campos,
        descripcion: 'Actualizó los datos del cliente desde Seguimiento Ventas',
        usuario_id: usuarioId,
      })
      setOriginal(campos)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Identificación</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Primer nombre" value={campos.primer_nombre} onChange={v => set('primer_nombre', v)} />
        <Field label="Segundo nombre" value={campos.segundo_nombre} onChange={v => set('segundo_nombre', v)} />
        <Field label="Primer apellido" value={campos.primer_apellido} onChange={v => set('primer_apellido', v)} />
        <Field label="Segundo apellido" value={campos.segundo_apellido} onChange={v => set('segundo_apellido', v)} />
      </div>
      <div className="grid grid-cols-[auto,1fr] gap-2">
        <div>
          <label className="text-xs text-gray-500">Tipo doc.</label>
          <select value={campos.tipo_documento} onChange={e => set('tipo_documento', e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5">
            {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Número de documento</label>
          <input
            value={campos.cedula.replace(/\D/g, '') ? Number(campos.cedula.replace(/\D/g, '')).toLocaleString('es-CO') : campos.cedula}
            onChange={e => set('cedula', e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Celular" value={campos.celular} onChange={v => set('celular', v)} />
        <Field label="Correo electrónico" value={campos.email} onChange={v => set('email', v)} />
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Ubicación</p>
      <Field label="Dirección" value={campos.direccion} onChange={v => set('direccion', v)} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Municipio" value={campos.municipio} onChange={v => set('municipio', v)} />
        <Field label="Ciudad / Pueblo" value={campos.ciudad} onChange={v => set('ciudad', v)} />
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Otros</p>
      <Field label="Descuentos que le aplican" value={campos.descuentos} onChange={v => set('descuentos', v)} />
      <Field label="Lugar de matrícula de la moto" value={campos.lugar_matricula} onChange={v => set('lugar_matricula', v)} />

      <button onClick={guardar} disabled={saving}
        className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 mt-2">
        {saving ? 'Guardando...' : 'Guardar datos'}
      </button>
    </div>
  )
}
