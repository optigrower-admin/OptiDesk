'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ConsultaRepuestos } from '@/components/ConsultaRepuestos'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCOP, generarCodigoExterno } from '@/lib/utils'

interface ItemOrdenLocal {
  id?: string
  descripcion: string
  origen: 'uma' | 'externo' | 'mano_obra'
  repuesto_uma_id?: string
  repuesto_externo_id?: string
  cantidad: number
  costo: number
  precio_venta: number
}

interface ExternoForm {
  nombre: string
  costo: string
  precio_venta: string
  cantidad: string
}

const externoInit: ExternoForm = { nombre: '', costo: '', precio_venta: '', cantidad: '1' }

export default function RepuestosPage() {
  const params = useParams()
  const ordenId = String(params.ordenId)
  const router = useRouter()
  const { profile } = useAuth()
  const supabase = createClient()

  const [items, setItems] = useState<ItemOrdenLocal[]>([])
  const [showConsulta, setShowConsulta] = useState(false)
  const [externoForm, setExternoForm] = useState<ExternoForm>(externoInit)
  const [showExternoForm, setShowExternoForm] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('items_orden')
      .select('id, descripcion, origen, repuesto_uma_id, repuesto_externo_id, cantidad, costo, precio_venta')
      .eq('orden_id', ordenId)
      .then(({ data }) => setItems(data ?? []))
  }, [ordenId])

  const addItem = (item: Omit<ItemOrdenLocal, 'id'>) => {
    setItems((prev) => [...prev, item])
  }

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleAgregarExterno = async () => {
    if (!externoForm.nombre || !externoForm.precio_venta || !profile?.tenant_id) return
    setSaving(true)
    try {
      const codigo = await generarCodigoExterno(supabase, profile.tenant_id)
      const { data: externo } = await supabase
        .from('repuestos_externos')
        .insert({
          tenant_id: profile.tenant_id,
          codigo,
          nombre: externoForm.nombre,
          ultimo_costo: parseFloat(externoForm.costo) || 0,
          ultimo_precio_venta: parseFloat(externoForm.precio_venta),
          registrado_por: profile.id,
        })
        .select('id')
        .single()

      if (externo) {
        addItem({
          descripcion: externoForm.nombre,
          origen: 'externo',
          repuesto_externo_id: externo.id,
          cantidad: parseInt(externoForm.cantidad) || 1,
          costo: parseFloat(externoForm.costo) || 0,
          precio_venta: parseFloat(externoForm.precio_venta),
        })
        setExternoForm(externoInit)
        setShowExternoForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleContinuar = async () => {
    if (!items.length) { router.push(`/mecanico/resumen/${ordenId}`); return }
    setSaving(true)
    try {
      // Eliminar items existentes y re-insertar (simple approach)
      await supabase.from('items_orden').delete().eq('orden_id', ordenId)
      const toInsert = items.map((item) => ({
        orden_id: ordenId,
        descripcion: item.descripcion,
        origen: item.origen,
        repuesto_uma_id: item.repuesto_uma_id ?? null,
        repuesto_externo_id: item.repuesto_externo_id ?? null,
        cantidad: item.cantidad,
        costo: item.costo,
        precio_venta: item.precio_venta,
      }))
      await supabase.from('items_orden').insert(toInsert)

      // Actualizar total en orden
      const total = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      await supabase.from('ordenes').update({ valor_total: total }).eq('id', ordenId)

      router.push(`/mecanico/resumen/${ordenId}`)
    } finally {
      setSaving(false)
    }
  }

  const total = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900">Repuestos</h1>
      </div>

      {/* Lista de ítems */}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={item.origen === 'uma' ? 'blue' : item.origen === 'mano_obra' ? 'gray' : 'amber'}>
                  {item.origen === 'uma' ? 'UMA' : item.origen === 'mano_obra' ? 'Mano obra' : 'Externo'}
                </Badge>
              </div>
              <p className="text-sm text-gray-800 leading-tight">{item.descripcion}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>Cant: {item.cantidad}</span>
                <span className="font-semibold text-gray-800">{formatCOP(item.precio_venta * item.cantidad)}</span>
              </div>
            </div>
            <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">Sin ítems agregados</div>
        )}
      </div>

      {/* Solo repuestos externos para el Profesional Mecánica */}
      <div className="space-y-2">
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
          Los repuestos UMA los agrega el <strong>Prof. Admin ST y Repuestos</strong> al confirmar la orden.
        </div>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setShowExternoForm(!showExternoForm)}
        >
          + Agregar repuesto externo / tercerizado
        </Button>
      </div>

      {/* Formulario externo */}
      {showExternoForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-amber-800">Repuesto externo / tercerizado</h3>
          <input
            value={externoForm.nombre}
            onChange={(e) => setExternoForm((p) => ({ ...p, nombre: e.target.value }))}
            placeholder="Nombre del repuesto *"
            className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-600">Costo</label>
              <input
                type="number"
                value={externoForm.costo}
                onChange={(e) => setExternoForm((p) => ({ ...p, costo: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Precio venta *</label>
              <input
                type="number"
                value={externoForm.precio_venta}
                onChange={(e) => setExternoForm((p) => ({ ...p, precio_venta: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Cantidad</label>
              <input
                type="number"
                min={1}
                value={externoForm.cantidad}
                onChange={(e) => setExternoForm((p) => ({ ...p, cantidad: e.target.value }))}
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAgregarExterno} loading={saving} disabled={!externoForm.nombre || !externoForm.precio_venta}>
              Agregar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowExternoForm(false); setExternoForm(externoInit) }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Total y continuar */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Total ítems: {items.length}</span>
          <span className="text-lg font-bold text-gray-900">{formatCOP(total)}</span>
        </div>
      </div>

      <Button className="w-full" size="lg" onClick={handleContinuar} loading={saving}>
        Continuar → Resumen
      </Button>

      {profile?.tenant_id && (
        <ConsultaRepuestos
          open={showConsulta}
          onClose={() => setShowConsulta(false)}
          tenantId={profile.tenant_id}
          onAdd={addItem}
        />
      )}
    </div>
  )
}
