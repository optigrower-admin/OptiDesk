'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  tenantId: string
  onConfirm: (motivo: string, detalle: string) => void
  onCancel: () => void
}

export default function ModalPerdida({ tenantId, onConfirm, onCancel }: Props) {
  const supabase = createClient()
  const [motivos, setMotivos]   = useState<{ id: string; motivo: string }[]>([])
  const [motivo, setMotivo]     = useState('')
  const [detalle, setDetalle]   = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    supabase.from('motivos_perdida')
      .select('id, motivo')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .order('orden')
      .then(({ data }) => {
        if (data?.length) {
          setMotivos(data)
        } else {
          // Motivos por defecto si no hay configurados
          setMotivos([
            { id: 'precio',       motivo: 'Precio / presupuesto' },
            { id: 'competencia',  motivo: 'Se fue a la competencia' },
            { id: 'momento',      motivo: 'No era el momento' },
            { id: 'financiacion', motivo: 'No calificó financiación' },
            { id: 'sin_respuesta',motivo: 'Dejó de responder' },
            { id: 'otro_modelo',  motivo: 'Compró otro modelo' },
            { id: 'otro',         motivo: 'Otro' },
          ])
        }
      })
  }, [tenantId])

  const handleConfirm = () => {
    if (!motivo) return
    setLoading(true)
    onConfirm(motivo, detalle)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Registrar motivo de pérdida</h2>
        <p className="text-sm text-gray-500 mb-5">Este dato es clave para mejorar el proceso de ventas.</p>

        <div className="space-y-3 mb-5">
          {motivos.map(m => (
            <button
              key={m.id}
              onClick={() => setMotivo(m.motivo)}
              className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                motivo === m.motivo
                  ? 'border-red-400 bg-red-50 text-red-800 font-semibold'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              {m.motivo}
            </button>
          ))}
        </div>

        <textarea
          value={detalle}
          onChange={e => setDetalle(e.target.value)}
          placeholder="Detalle adicional (opcional)..."
          rows={2}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4"
        />

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!motivo || loading}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
          >
            Confirmar pérdida
          </button>
        </div>
      </div>
    </div>
  )
}
