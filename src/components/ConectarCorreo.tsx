'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  usuarioId: string
}

export default function ConectarCorreo({ usuarioId }: Props) {
  const supabase = createClient()
  const [conectado, setConectado]   = useState<string | null>(null)
  const [email, setEmail]           = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    supabase.from('usuarios').select('email_smtp_usuario').eq('id', usuarioId).single()
      .then(({ data }) => { setConectado(data?.email_smtp_usuario ?? null); setLoading(false) })
  }, [usuarioId])

  async function conectar() {
    setGuardando(true); setError('')
    try {
      const res = await fetch('/api/admin/perfil/conectar-correo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, app_password: appPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al conectar')
      setConectado(email)
      setEmail(''); setAppPassword('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al conectar')
    } finally {
      setGuardando(false)
    }
  }

  async function desconectar() {
    if (!confirm('¿Desconectar tu correo? Dejarás de poder enviar recordatorios y correos a clientes.')) return
    await fetch('/api/admin/perfil/conectar-correo', { method: 'DELETE' })
    setConectado(null)
  }

  if (loading) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="font-semibold text-gray-900 mb-1">Conectar mi correo</h2>
      <p className="text-xs text-gray-500 mb-3">
        Para enviar recordatorios y correos a clientes desde Seguimiento Ventas usando tu propio Gmail.
      </p>

      {conectado ? (
        <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <p className="text-sm text-green-700">✓ Conectado como <span className="font-semibold">{conectado}</span></p>
          <button onClick={desconectar} className="text-xs text-red-600 hover:underline flex-shrink-0">Desconectar</button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Instrucciones siempre visibles, justo antes de los campos */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-800 mb-1.5">Antes de conectar, genera tu contraseña de aplicación:</p>
            <ol className="text-xs text-blue-700 list-decimal pl-4 space-y-1">
              <li>
                Abre{' '}
                <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                  myaccount.google.com/security
                </a>{' '}
                con el Gmail que quieres conectar (inicia sesión si te lo pide).
              </li>
              <li>Activa <span className="font-medium">"Verificación en dos pasos"</span> si todavía no la tienes.</li>
              <li>
                En el buscador de esa misma página escribe{' '}
                <span className="font-medium">"Contraseñas de aplicaciones"</span> y entra ahí.
              </li>
              <li>Escribe un nombre (ej. "OptiDesk") y dale <span className="font-medium">Crear</span>.</li>
              <li>Google te muestra 16 letras en un recuadro amarillo — cópialas tal cual (sin espacios) y pégalas abajo en "Contraseña de aplicación".</li>
            </ol>
          </div>

          <div>
            <label className="text-xs text-gray-500">Tu Gmail</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="tucorreo@gmail.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Contraseña de aplicación (las 16 letras del paso anterior)</label>
            <input value={appPassword} onChange={e => setAppPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx"
              type="password"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={conectar} disabled={!email.trim() || !appPassword.trim() || guardando}
            className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Conectando...' : 'Conectar'}
          </button>
        </div>
      )}
    </div>
  )
}
