'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

interface Colaborador {
  id: string
  nombre: string | null
  email: string | null
  rol: string
  activo: boolean
  whatsapp_number: string | null
  wa_sesion_at: string | null
}

function formatRelativo(isoStr: string | null): string {
  if (!isoStr) return '—'
  const ms = Date.now() - new Date(isoStr).getTime()
  const h  = Math.floor(ms / 3600000)
  const m  = Math.floor((ms % 3600000) / 60000)
  if (h > 48) return `hace ${Math.floor(h / 24)} días`
  if (h > 0)  return `hace ${h}h ${m}m`
  return `hace ${m}m`
}

function sesionColor(isoStr: string | null): string {
  if (!isoStr) return 'bg-gray-100 text-gray-500'
  const h = (Date.now() - new Date(isoStr).getTime()) / 3600000
  if (h < 22)  return 'bg-green-100 text-green-700'
  if (h < 23)  return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-600'
}

function sesionLabel(isoStr: string | null): string {
  if (!isoStr) return 'Sin sesión'
  const h = (Date.now() - new Date(isoStr).getTime()) / 3600000
  if (h < 22)  return 'Activa'
  if (h < 23)  return 'Por vencer'
  return 'Vencida'
}

export default function ColaboradoresPage() {
  const { profile } = useAuth()
  const supabase     = createClient()

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [editando, setEditando]           = useState<Record<string, string>>({})
  const [guardando, setGuardando]         = useState<Record<string, boolean>>({})
  const [mensaje, setMensaje]             = useState<{ id: string; texto: string; ok: boolean } | null>(null)
  const [enviandoPing, setEnviandoPing]   = useState<Record<string, boolean>>({})

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    const { data } = await supabase
      .from('usuarios')
      .select('id, nombre, email, rol, activo, whatsapp_number, wa_sesion_at')
      .eq('tenant_id', profile.tenant_id)
      .order('nombre')
    setColaboradores((data ?? []) as Colaborador[])
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  async function guardarNumero(id: string) {
    const numero = (editando[id] ?? '').replace(/\s/g, '')
    if (numero && !/^\d{10,15}$/.test(numero)) {
      setMensaje({ id, texto: 'Número inválido. Usa solo dígitos, sin +, ej: 573001234567', ok: false })
      return
    }
    setGuardando(p => ({ ...p, [id]: true }))
    const { error } = await supabase
      .from('usuarios')
      .update({ whatsapp_number: numero || null })
      .eq('id', id)
    setGuardando(p => ({ ...p, [id]: false }))
    if (error) {
      setMensaje({ id, texto: error.message, ok: false })
    } else {
      setMensaje({ id, texto: 'Guardado', ok: true })
      setEditando(p => { const n = { ...p }; delete n[id]; return n })
      cargar()
    }
    setTimeout(() => setMensaje(null), 3000)
  }

  async function enviarPing(colaborador: Colaborador) {
    if (!colaborador.whatsapp_number) return
    setEnviandoPing(p => ({ ...p, [colaborador.id]: true }))
    const res = await fetch('/api/admin/mensajes/ping-colaborador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId: colaborador.id }),
    })
    setEnviandoPing(p => ({ ...p, [colaborador.id]: false }))
    if (res.ok) {
      setMensaje({ id: colaborador.id, texto: 'Mensaje enviado', ok: true })
    } else {
      setMensaje({ id: colaborador.id, texto: 'Error al enviar', ok: false })
    }
    setTimeout(() => setMensaje(null), 3000)
  }

  const ROL_LABEL: Record<string, string> = {
    gerencia: 'Gerencia', dueno: 'Dueño', admin: 'Administrador', asesor: 'Asesor', mecanico: 'Mecánico',
  }

  if (!profile) return null

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Bot WhatsApp — Colaboradores</h1>
        <p className="text-sm text-gray-500 mt-1">
          Asigna un número de WhatsApp a cada miembro del equipo. Cuando ese número envíe un
          mensaje al número empresarial, el bot responderá con información interna.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">¿Cómo funciona?</p>
        <p>1. El colaborador envía cualquier mensaje al número de WhatsApp de la empresa.</p>
        <p>2. El bot responde con un menú numerado.</p>
        <p>3. El colaborador responde con un número para ver la información.</p>
        <p>4. Cada 22-23 horas el sistema envía un mensaje pidiendo &quot;OK&quot; para mantener la sesión activa.</p>
      </div>

      <div className="space-y-3">
        {colaboradores.map(col => {
          const valorInput   = editando[col.id] !== undefined ? editando[col.id] : (col.whatsapp_number ?? '')
          const hayMsg       = mensaje?.id === col.id

          return (
            <div key={col.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{col.nombre ?? col.email}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {ROL_LABEL[col.rol] ?? col.rol}
                    </span>
                    {!col.activo && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactivo</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{col.email}</p>
                </div>

                {col.whatsapp_number && (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sesionColor(col.wa_sesion_at)}`}>
                      {sesionLabel(col.wa_sesion_at)} · {formatRelativo(col.wa_sesion_at)}
                    </span>
                    <button
                      onClick={() => enviarPing(col)}
                      disabled={enviandoPing[col.id]}
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {enviandoPing[col.id] ? 'Enviando...' : 'Enviar menú'}
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">+</span>
                  <input
                    type="tel"
                    value={valorInput}
                    placeholder="573001234567"
                    onChange={e => setEditando(p => ({ ...p, [col.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && guardarNumero(col.id)}
                    className="w-full pl-6 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => guardarNumero(col.id)}
                  disabled={guardando[col.id] || editando[col.id] === undefined}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {guardando[col.id] ? 'Guardando...' : 'Guardar'}
                </button>
                {col.whatsapp_number && !editando[col.id] && (
                  <button
                    onClick={() => setEditando(p => ({ ...p, [col.id]: col.whatsapp_number! }))}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Editar
                  </button>
                )}
              </div>

              {hayMsg && (
                <p className={`mt-1 text-xs ${mensaje!.ok ? 'text-green-600' : 'text-red-600'}`}>
                  {mensaje!.texto}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
