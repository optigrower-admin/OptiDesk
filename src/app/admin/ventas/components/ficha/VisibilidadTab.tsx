'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registrarAuditoria } from '@/lib/audit'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
  onChange?: () => void
}

type Usuario = { id: string; nombre: string; rol: string }

export default function VisibilidadTab({ clienteId, tenantId, usuarioId, onChange }: Props) {
  const supabase = createClient()
  const [usuarios, setUsuarios]   = useState<Usuario[]>([])
  const [compartidoCon, setCompartidoCon] = useState<Set<string>>(new Set())
  const [loading, setLoading]     = useState(true)

  const cargar = useCallback(async () => {
    const [{ data: us }, { data: vis }] = await Promise.all([
      supabase.from('usuarios').select('id, nombre, rol').eq('tenant_id', tenantId).eq('activo', true),
      supabase.from('clientes_visibilidad').select('usuario_id').eq('cliente_id', clienteId),
    ])
    setUsuarios((us ?? []) as Usuario[])
    setCompartidoCon(new Set((vis ?? []).map(v => v.usuario_id)))
    setLoading(false)
  }, [clienteId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  async function toggle(usuario: Usuario) {
    if (compartidoCon.has(usuario.id)) {
      await supabase.from('clientes_visibilidad').delete().eq('cliente_id', clienteId).eq('usuario_id', usuario.id)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId, tabla: 'clientes_visibilidad', registro_id: clienteId, tipo: 'eliminacion',
        descripcion: `Quitó a ${usuario.nombre} de la visibilidad del cliente`, usuario_id: usuarioId,
      })
    } else {
      await supabase.from('clientes_visibilidad').insert({ cliente_id: clienteId, usuario_id: usuario.id, agregado_por: usuarioId })
      await registrarAuditoria(supabase, {
        tenant_id: tenantId, tabla: 'clientes_visibilidad', registro_id: clienteId, tipo: 'edicion',
        descripcion: `Compartió el cliente con ${usuario.nombre}`, usuario_id: usuarioId,
      })
    }
    cargar()
    onChange?.()
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quién más puede ver este cliente</p>
      <p className="text-xs text-gray-400">El usuario asignado siempre lo ve. Aquí compartes el acceso con otros, además de Gerencia.</p>

      <div className="space-y-1.5">
        {usuarios.map(u => (
          <label key={u.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={compartidoCon.has(u.id)} onChange={() => toggle(u)} />
            <span className="text-sm text-gray-800">{u.nombre}</span>
            <span className="text-xs text-gray-400">({u.rol})</span>
          </label>
        ))}
      </div>

      <p className="text-xs text-gray-400 pt-1">
        El historial de cambios de visibilidad queda en Auditoría.
      </p>
    </div>
  )
}
