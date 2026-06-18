'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { registrarAuditoria } from '@/lib/audit'

interface Usuario {
  id: string
  nombre: string
  email: string
  rol: 'mecanico' | 'admin' | 'gerencia' | 'control_total'
  activo: boolean
  tenant_id: string | null
  created_at: string
}

interface Tenant {
  id: string
  nombre: string
  activo: boolean
}

const rolColors: Record<string, 'blue' | 'amber' | 'purple' | 'green'> = {
  mecanico: 'blue',
  admin: 'amber',
  gerencia: 'green',
  control_total: 'purple',
}

const rolLabels: Record<string, string> = {
  control_total: 'Control Total',
  gerencia: 'Gerencia',
  admin: 'Administración',
  mecanico: 'Profesional',
}

export default function UsuariosPage() {
  const supabase = createClient()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'mecanico', tenant_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [editRol, setEditRol] = useState<'gerencia' | 'admin' | 'mecanico'>('mecanico')
  const [editNombre, setEditNombre] = useState('')
  const [savingRol, setSavingRol] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState('')
  const [resetingPw, setResetingPw] = useState(false)
  const [resetPwMsg, setResetPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const [{ data: u }, { data: t }] = await Promise.all([
      supabase.from('usuarios').select('id, nombre, email, rol, activo, tenant_id, created_at').neq('rol', 'control_total').order('nombre'),
      supabase.from('tenants').select('id, nombre, activo').order('nombre'),
    ])
    setUsuarios((u as unknown as Usuario[]) ?? [])
    setTenants((t as Tenant[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const toggleEmpresa = (id: string) => {
    setExpandidos((prev) => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const toggleActivo = async (id: string, activo: boolean) => {
    const u = usuarios.find((x) => x.id === id)
    await supabase.from('usuarios').update({ activo: !activo }).eq('id', id)
    const { data: { user } } = await supabase.auth.getUser()
    await registrarAuditoria(supabase, {
      tenant_id: u?.tenant_id ?? '',
      tabla: 'usuarios',
      registro_id: id,
      tipo: 'edicion',
      valor_anterior: { activo },
      valor_nuevo: { activo: !activo },
      descripcion: `${!activo ? 'Activó' : 'Desactivó'} a "${u?.nombre}" (control_total)`,
      usuario_id: user?.id,
    })
    setUsuarios((prev) => prev.map((u) => u.id === id ? { ...u, activo: !activo } : u))
  }

  const handleCreate = async () => {
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowModal(false)
      setForm({ nombre: '', email: '', password: '', rol: 'mecanico', tenant_id: '' })
      await cargar()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const abrirEditar = (u: Usuario) => {
    setEditando(u)
    setEditRol(u.rol as 'gerencia' | 'admin' | 'mecanico')
    setEditNombre(u.nombre)
    setConfirmDelete(false)
    setDeleteMsg('')
    setResetingPw(false)
    setResetPwMsg(null)
  }

  const enviarReset = async () => {
    if (!editando) return
    setResetingPw(true)
    setResetPwMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(editando.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetPwMsg({
      ok: !error,
      text: error ? 'Error al enviar el correo' : `Correo enviado a ${editando.email}`,
    })
    setResetingPw(false)
  }

  const guardarCambios = async () => {
    if (!editando) return
    setSavingRol(true)
    const nuevoNombre = editNombre.trim() || editando.nombre
    await supabase.from('usuarios').update({
      rol: editRol,
      nombre: nuevoNombre,
    }).eq('id', editando.id)
    const { data: { user } } = await supabase.auth.getUser()
    await registrarAuditoria(supabase, {
      tenant_id: editando.tenant_id ?? '',
      tabla: 'usuarios',
      registro_id: editando.id,
      tipo: 'edicion',
      valor_anterior: { rol: editando.rol, nombre: editando.nombre },
      valor_nuevo: { rol: editRol, nombre: nuevoNombre },
      descripcion: `Editó a "${editando.nombre}" (rol ${editando.rol} → ${editRol}) — control_total`,
      usuario_id: user?.id,
    })
    setUsuarios((prev) => prev.map((u) =>
      u.id === editando.id ? { ...u, rol: editRol, nombre: nuevoNombre } : u
    ))
    setEditando(null)
    setSavingRol(false)
  }

  const eliminarUsuario = async () => {
    if (!editando) return
    setDeleting(true)
    setDeleteMsg('')
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: editando.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsuarios((prev) => prev.filter((u) => u.id !== editando.id))
      setEditando(null)
    } catch (e: unknown) {
      setDeleteMsg(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  const porEmpresa = (tenantId: string) => usuarios.filter((u) => u.tenant_id === tenantId)

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500">{usuarios.length} usuarios · {tenants.length} empresas</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Nuevo usuario</Button>
      </div>

      {/* Empresas expandibles */}
      {tenants.map((t) => {
        const miembros = porEmpresa(t.id)
        const abierto = expandidos.has(t.id)
        return (
          <div key={t.id} className={`bg-white border rounded-xl overflow-hidden shadow-sm ${!t.activo ? 'opacity-60 border-gray-100' : 'border-gray-200'}`}>
            <button
              onClick={() => toggleEmpresa(t.id)}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${t.activo ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="font-semibold text-gray-900">{t.nombre}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {miembros.length} usuario{miembros.length !== 1 ? 's' : ''}
                </span>
                {/* Resumen de roles */}
                <div className="flex gap-1">
                  {(['gerencia', 'admin', 'mecanico'] as const).map((rol) => {
                    const count = miembros.filter((m) => m.rol === rol).length
                    if (!count) return null
                    const colors = { gerencia: 'bg-green-100 text-green-700', admin: 'bg-amber-100 text-amber-700', mecanico: 'bg-blue-100 text-blue-700' }
                    return (
                      <span key={rol} className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors[rol]}`}>
                        {count} {rolLabels[rol]}
                      </span>
                    )
                  })}
                </div>
              </div>
              <span className="text-gray-400 text-lg">{abierto ? '▲' : '▼'}</span>
            </button>

            {abierto && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {miembros.length === 0 ? (
                  <p className="py-4 px-4 text-sm text-gray-400 italic">Sin usuarios registrados</p>
                ) : (
                  miembros.map((u) => <UsuarioFila key={u.id} u={u} onToggle={toggleActivo} onEdit={abrirEditar} />)
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Modal nuevo usuario */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nuevo usuario" size="sm">
        <div className="space-y-3">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
            placeholder="Nombre completo" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="Email" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            placeholder="Contraseña (mínimo 6 caracteres)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <select
            value={form.rol}
            onChange={(e) => setForm((p) => ({ ...p, rol: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="mecanico">Profesional</option>
            <option value="admin">Administración</option>
            <option value="gerencia">Gerencia</option>
          </select>
          <select value={form.tenant_id} onChange={(e) => setForm((p) => ({ ...p, tenant_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Seleccionar empresa</option>
            {tenants.filter((t) => t.activo).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleCreate}
              loading={saving}
              disabled={!form.nombre || !form.email || !form.password || !form.tenant_id}
              className="flex-1"
            >
              Crear usuario
            </Button>
            <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal editar usuario */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h2 className="font-bold text-gray-900">Editar usuario</h2>
              <p className="text-xs text-gray-400">{editando.email}</p>
            </div>

            {/* Nombre */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
              <input
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>

            {/* Rol */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Rol</label>
              <div className="space-y-2">
                {([
                  { value: 'gerencia', label: 'Gerencia',           desc: 'Control total de su empresa' },
                  { value: 'admin',    label: 'Administración',     desc: 'Acceso por secciones según permisos' },
                  { value: 'mecanico', label: 'Profesional',        desc: 'Solo sus órdenes de trabajo' },
                ] as { value: 'gerencia' | 'admin' | 'mecanico'; label: string; desc: string }[]).map((op) => (
                  <button
                    key={op.value}
                    onClick={() => setEditRol(op.value)}
                    className={`w-full p-3 rounded-xl border-2 text-left transition-colors ${
                      editRol === op.value
                        ? op.value === 'gerencia' ? 'border-green-400 bg-green-50'
                        : op.value === 'admin'    ? 'border-amber-400 bg-amber-50'
                        :                           'border-blue-400 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900">{op.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{op.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Botones principales */}
            <div className="flex gap-2">
              <button
                onClick={guardarCambios}
                disabled={savingRol || !editNombre.trim()}
                className="flex-1 bg-purple-700 hover:bg-purple-800 disabled:bg-gray-200 disabled:text-gray-400 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                {savingRol ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={() => setEditando(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
            </div>

            {/* Recuperar contraseña */}
            <div className="border-t pt-3">
              <button
                onClick={enviarReset}
                disabled={resetingPw}
                className="w-full text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 py-2 rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {resetingPw ? 'Enviando...' : 'Enviar correo de recuperación de contraseña'}
              </button>
              {resetPwMsg && (
                <p className={`text-xs text-center mt-1.5 font-medium ${resetPwMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
                  {resetPwMsg.text}
                </p>
              )}
            </div>

            {/* Zona eliminar */}
            <div className="border-t pt-3">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-sm text-red-500 hover:text-red-700 hover:bg-red-50 py-2 rounded-lg transition-colors font-medium"
                >
                  Eliminar usuario
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-600 font-medium text-center">
                    ¿Eliminar a <strong>{editando.nombre}</strong>? Esta acción no se puede deshacer.
                  </p>
                  {deleteMsg && <p className="text-xs text-red-500 text-center">{deleteMsg}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={eliminarUsuario}
                      disabled={deleting}
                      className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UsuarioFila({
  u, onToggle, onEdit,
}: {
  u: Usuario
  onToggle: (id: string, activo: boolean) => void
  onEdit: (u: Usuario) => void
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${!u.activo ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">
          {u.nombre[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{u.nombre}</p>
          <p className="text-xs text-gray-400">{u.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={rolColors[u.rol]}>{rolLabels[u.rol] ?? u.rol}</Badge>
        <button
          onClick={() => onEdit(u)}
          className="text-xs text-purple-600 hover:text-purple-800 font-medium hover:underline"
        >
          Editar
        </button>
        <button
          onClick={() => onToggle(u.id, u.activo)}
          className={`w-8 h-5 rounded-full transition-colors flex-shrink-0 ${u.activo ? 'bg-green-500' : 'bg-gray-300'}`}
        >
          <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${u.activo ? 'translate-x-3' : ''}`} />
        </button>
      </div>
    </div>
  )
}
