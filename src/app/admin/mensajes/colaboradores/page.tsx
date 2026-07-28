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
  email_smtp_usuario: string | null
}

type ResultadoResumen = { usuariosNotificados: number; whatsappEnviados: number; emailsEnviados: number; emailsFallidos: number }

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
  const [editandoEmail, setEditandoEmail] = useState<Record<string, string>>({})
  const [guardandoEmail, setGuardandoEmail] = useState<Record<string, boolean>>({})
  const [mensaje, setMensaje]             = useState<{ id: string; texto: string; ok: boolean } | null>(null)
  const [enviandoPing, setEnviandoPing]   = useState<Record<string, boolean>>({})
  const [enviandoResumen, setEnviandoResumen] = useState<Record<string, boolean>>({})
  const [resultadoResumen, setResultadoResumen] = useState<Record<string, ResultadoResumen>>({})
  const [probandoTodos, setProbandoTodos] = useState(false)
  const [resultadoTodos, setResultadoTodos] = useState<ResultadoResumen | null>(null)
  const [canalesTodos, setCanalesTodos] = useState({ whatsapp: true, email: true })
  const [canalesPorColaborador, setCanalesPorColaborador] = useState<Record<string, { whatsapp: boolean; email: boolean }>>({})

  // Correo de la empresa (una sola cuenta compartida, no por usuario)
  const [correoEmpresa, setCorreoEmpresa]         = useState<string | null>(null)
  const [cargandoEmpresa, setCargandoEmpresa]     = useState(true)
  const [emailEmpresaInput, setEmailEmpresaInput] = useState('')
  const [appPasswordEmpresa, setAppPasswordEmpresa] = useState('')
  const [conectandoEmpresa, setConectandoEmpresa] = useState(false)
  const [errorEmpresa, setErrorEmpresa]           = useState('')

  const cargarCorreoEmpresa = useCallback(async () => {
    setCargandoEmpresa(true)
    const res = await fetch('/api/admin/mensajes/conectar-correo-empresa')
    const data = await res.json().catch(() => ({}))
    setCorreoEmpresa(data?.conectado ?? null)
    setCargandoEmpresa(false)
  }, [])

  useEffect(() => { cargarCorreoEmpresa() }, [cargarCorreoEmpresa])

  async function conectarCorreoEmpresa() {
    setConectandoEmpresa(true); setErrorEmpresa('')
    try {
      const res = await fetch('/api/admin/mensajes/conectar-correo-empresa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailEmpresaInput, app_password: appPasswordEmpresa }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al conectar')
      setCorreoEmpresa(emailEmpresaInput)
      setEmailEmpresaInput(''); setAppPasswordEmpresa('')
    } catch (e) {
      setErrorEmpresa(e instanceof Error ? e.message : 'Error al conectar')
    } finally {
      setConectandoEmpresa(false)
    }
  }

  async function desconectarCorreoEmpresa() {
    if (!confirm('¿Desconectar el correo de la empresa? El resumen diario dejará de poder enviarse por correo.')) return
    await fetch('/api/admin/mensajes/conectar-correo-empresa', { method: 'DELETE' })
    setCorreoEmpresa(null)
  }

  function canalesDe(id: string) {
    return canalesPorColaborador[id] ?? { whatsapp: true, email: true }
  }
  function toggleCanal(id: string, canal: 'whatsapp' | 'email') {
    setCanalesPorColaborador(p => {
      const actual = p[id] ?? { whatsapp: true, email: true }
      return { ...p, [id]: { ...actual, [canal]: !actual[canal] } }
    })
  }

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    const { data } = await supabase
      .from('usuarios')
      .select('id, nombre, email, rol, activo, whatsapp_number, wa_sesion_at, email_smtp_usuario')
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

  async function guardarEmailNotificacion(id: string) {
    const correo = (editandoEmail[id] ?? '').trim()
    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setMensaje({ id, texto: 'Correo inválido', ok: false })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setGuardandoEmail(p => ({ ...p, [id]: true }))
    const { error } = await supabase
      .from('usuarios')
      .update({ email: correo })
      .eq('id', id)
    setGuardandoEmail(p => ({ ...p, [id]: false }))
    if (error) {
      setMensaje({ id, texto: error.message, ok: false })
    } else {
      setMensaje({ id, texto: 'Guardado — solo cambia a dónde llega el resumen, no el inicio de sesión', ok: true })
      setEditandoEmail(p => { const n = { ...p }; delete n[id]; return n })
      cargar()
    }
    setTimeout(() => setMensaje(null), 4000)
  }

  async function enviarResumen(colaborador: Colaborador) {
    const canales = canalesDe(colaborador.id)
    if (!canales.whatsapp && !canales.email) {
      setMensaje({ id: colaborador.id, texto: 'Elige al menos un canal', ok: false })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setEnviandoResumen(p => ({ ...p, [colaborador.id]: true }))
    setResultadoResumen(p => { const n = { ...p }; delete n[colaborador.id]; return n })
    try {
      const res = await fetch('/api/admin/ventas/resumen-diario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId: colaborador.id, whatsapp: canales.whatsapp, email: canales.email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Error al enviar')
      setResultadoResumen(p => ({ ...p, [colaborador.id]: data }))
    } catch (e) {
      setMensaje({ id: colaborador.id, texto: e instanceof Error ? e.message : 'Error al enviar', ok: false })
      setTimeout(() => setMensaje(null), 3000)
    } finally {
      setEnviandoResumen(p => ({ ...p, [colaborador.id]: false }))
    }
  }

  async function probarResumenTodos() {
    if (!canalesTodos.whatsapp && !canalesTodos.email) {
      alert('Elige al menos un canal')
      return
    }
    setProbandoTodos(true)
    setResultadoTodos(null)
    try {
      const res = await fetch('/api/admin/ventas/resumen-diario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp: canalesTodos.whatsapp, email: canalesTodos.email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Error al enviar')
      setResultadoTodos(data)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo ejecutar el resumen diario')
    } finally {
      setProbandoTodos(false)
    }
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

      {/* Correo de la empresa — una sola cuenta compartida, como la conexión de Meta */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <p className="font-semibold text-gray-900 text-sm mb-1">✉️ Correo de la empresa</p>
        <p className="text-xs text-gray-500 mb-3">
          Una sola cuenta de Gmail para toda la empresa (igual que la conexión de Meta/WhatsApp).
          Desde aquí se envía el resumen diario a todos los colaboradores — nadie más tiene que
          conectar nada.
        </p>

        {cargandoEmpresa ? (
          <p className="text-xs text-gray-400">Cargando...</p>
        ) : correoEmpresa ? (
          <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <p className="text-sm text-green-700">✓ Conectado como <span className="font-semibold">{correoEmpresa}</span></p>
            <button onClick={desconectarCorreoEmpresa} className="text-xs text-red-600 hover:underline flex-shrink-0">Desconectar</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-800 mb-1.5">Antes de conectar, genera la contraseña de aplicación:</p>
              <ol className="text-xs text-blue-700 list-decimal pl-4 space-y-1">
                <li>
                  Abre{' '}
                  <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    myaccount.google.com/security
                  </a>{' '}
                  con el Gmail de la empresa (ej. motospace38@gmail.com).
                </li>
                <li>Activa <span className="font-medium">&quot;Verificación en dos pasos&quot;</span> si todavía no la tiene.</li>
                <li>En el buscador de esa misma página escribe <span className="font-medium">&quot;Contraseñas de aplicaciones&quot;</span> y entra ahí.</li>
                <li>Escribe un nombre (ej. &quot;OptiDesk&quot;) y dale <span className="font-medium">Crear</span>.</li>
                <li>Google muestra 16 letras en un recuadro amarillo — cópialas tal cual (sin espacios) y pégalas abajo.</li>
              </ol>
            </div>
            <div>
              <label className="text-xs text-gray-500">Gmail de la empresa</label>
              <input value={emailEmpresaInput} onChange={e => setEmailEmpresaInput(e.target.value)} placeholder="motospace38@gmail.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Contraseña de aplicación (las 16 letras)</label>
              <input value={appPasswordEmpresa} onChange={e => setAppPasswordEmpresa(e.target.value)} placeholder="xxxx xxxx xxxx xxxx"
                type="password"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
            </div>
            {errorEmpresa && <p className="text-xs text-red-600">{errorEmpresa}</p>}
            <button onClick={conectarCorreoEmpresa} disabled={!emailEmpresaInput.trim() || !appPasswordEmpresa.trim() || conectandoEmpresa}
              className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
              {conectandoEmpresa ? 'Conectando...' : 'Conectar'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold text-gray-900 text-sm">📋 Resumen diario automático</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Todos los días a las 8:00 a.m. (hora Colombia) cada asesor recibe, solo, un resumen de
              sus acciones vencidas y de hoy — por WhatsApp (si tiene sesión activa abajo) y por
              correo, usando el Correo de la empresa de arriba.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={canalesTodos.whatsapp}
                  onChange={() => setCanalesTodos(p => ({ ...p, whatsapp: !p.whatsapp }))} className="rounded" />
                📱 WhatsApp
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={canalesTodos.email}
                  onChange={() => setCanalesTodos(p => ({ ...p, email: !p.email }))} className="rounded" />
                ✉️ Correo
              </label>
            </div>
            <button onClick={probarResumenTodos} disabled={probandoTodos}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
              {probandoTodos ? 'Enviando...' : '📤 Probar para todos ahora'}
            </button>
          </div>
        </div>
        {resultadoTodos && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 space-y-0.5">
            <p>👤 Asesores notificados: <strong>{resultadoTodos.usuariosNotificados}</strong></p>
            <p>📱 WhatsApp enviados: <strong>{resultadoTodos.whatsappEnviados}</strong></p>
            <p>✉️ Correos enviados: <strong>{resultadoTodos.emailsEnviados}</strong>{resultadoTodos.emailsFallidos > 0 && <span className="text-amber-600"> ({resultadoTodos.emailsFallidos} fallidos)</span>}</p>
            {resultadoTodos.usuariosNotificados === 0 && <p className="text-gray-400 mt-1">Nadie tiene acciones vencidas o de hoy asignadas en este momento.</p>}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {colaboradores.map(col => {
          const valorInput      = editando[col.id] !== undefined ? editando[col.id] : (col.whatsapp_number ?? '')
          const valorInputEmail = editandoEmail[col.id] !== undefined ? editandoEmail[col.id] : (col.email ?? '')
          const editandoEsteEmail = editandoEmail[col.id] !== undefined
          const hayMsg       = mensaje?.id === col.id

          return (
            <div key={col.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{col.nombre ?? col.email}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {ROL_LABEL[col.rol] ?? col.rol}
                    </span>
                    {!col.activo && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactivo</span>
                    )}
                  </div>

                  {/* Correo de notificación (a dónde llega el resumen) — editable */}
                  <div className="mt-1 flex items-center gap-1.5 max-w-sm">
                    <input
                      type="email"
                      value={valorInputEmail}
                      onChange={e => setEditandoEmail(p => ({ ...p, [col.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && guardarEmailNotificacion(col.id)}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {editandoEsteEmail && (
                      <>
                        <button
                          onClick={() => guardarEmailNotificacion(col.id)}
                          disabled={guardandoEmail[col.id]}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                        >
                          {guardandoEmail[col.id] ? '...' : 'Guardar'}
                        </button>
                        <button
                          onClick={() => setEditandoEmail(p => { const n = { ...p }; delete n[col.id]; return n })}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">A este correo llega el resumen diario. No cambia su inicio de sesión.</p>

                  <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    col.email_smtp_usuario ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`} title="Esto es aparte del resumen diario — es para cuando este colaborador envía correos a clientes desde su propio Gmail (Mi perfil)">
                    {col.email_smtp_usuario ? `✉️ Gmail personal conectado (${col.email_smtp_usuario})` : '✉️ Gmail personal sin conectar'}
                  </span>
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

              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={canalesDe(col.id).whatsapp}
                      onChange={() => toggleCanal(col.id, 'whatsapp')} className="rounded" />
                    📱
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={canalesDe(col.id).email}
                      onChange={() => toggleCanal(col.id, 'email')} className="rounded" />
                    ✉️
                  </label>
                </div>
                <button
                  onClick={() => enviarResumen(col)}
                  disabled={enviandoResumen[col.id]}
                  className="text-xs px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
                >
                  {enviandoResumen[col.id] ? 'Enviando...' : '📋 Enviarle su resumen ahora'}
                </button>
                {resultadoResumen[col.id] && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    {resultadoResumen[col.id].usuariosNotificados === 0
                      ? 'Sin acciones vencidas o de hoy asignadas.'
                      : `📱 WhatsApp: ${resultadoResumen[col.id].whatsappEnviados > 0 ? 'enviado' : 'no enviado (sin sesión activa)'} · ✉️ Correo: ${resultadoResumen[col.id].emailsEnviados > 0 ? 'enviado' : 'no enviado'}`}
                  </p>
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
