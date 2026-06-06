'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatBytes } from '@/lib/utils'

interface Tenant {
  id: string
  nombre: string
  slug: string
  activo: boolean
  storage_usado_bytes: number
  nombre_herramienta: string | null
  drive_folder_id: string | null
  archivado_drive_habilitado: boolean
  logo_url: string | null
  created_at: string
  // conteos
  usuarios_count?: number
  ordenes_activas?: number
}

interface UsuarioCount {
  tenant_id: string
  rol: string
}

export default function TenantsPage() {
  const supabase = createClient()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  // Modal nuevo taller
  const [showModal, setShowModal] = useState(false)
  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [nombreHerramienta, setNombreHerramienta] = useState('')
  const [saving, setSaving] = useState(false)

  // Modal editar taller
  const [editTenant, setEditTenant] = useState<Tenant | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editNombreHerramienta, setEditNombreHerramienta] = useState('')
  const [editDriveFolder, setEditDriveFolder] = useState('')
  const [editDriveHabilitado, setEditDriveHabilitado] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoMsg, setLogoMsg] = useState('')

  // Modal reiniciar empresa
  const [resetTenant, setResetTenant] = useState<Tenant | null>(null)
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
  const [exportando, setExportando] = useState(false)
  const [resetModo, setResetModo] = useState<'completo' | 'operativo'>('completo')

  const cargar = useCallback(async () => {
    setLoading(true)
    const [{ data: ts }, { data: us }, { data: os }] = await Promise.all([
      supabase.from('tenants').select('id, nombre, slug, activo, storage_usado_bytes, nombre_herramienta, drive_folder_id, archivado_drive_habilitado, logo_url, created_at').order('created_at', { ascending: false }),
      supabase.from('usuarios').select('tenant_id, rol').eq('activo', true),
      supabase.from('ordenes').select('tenant_id, estado').in('estado', ['falta_revision', 'en_proceso', 'pendiente']),
    ])

    const usuarios = (us ?? []) as UsuarioCount[]
    const ordenes = (os ?? []) as { tenant_id: string; estado: string }[]

    const tenantsData = ((ts ?? []) as Tenant[]).map((t) => ({
      ...t,
      usuarios_count: usuarios.filter((u) => u.tenant_id === t.id).length,
      ordenes_activas: ordenes.filter((o) => o.tenant_id === t.id).length,
    }))

    setTenants(tenantsData)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const handleCreate = async () => {
    if (!nombre || !slug) return
    setSaving(true)
    try {
      await supabase.from('tenants').insert({
        nombre,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        nombre_herramienta: nombreHerramienta || null,
      })
      setShowModal(false)
      setNombre('')
      setSlug('')
      setNombreHerramienta('')
      await cargar()
    } finally {
      setSaving(false)
    }
  }

  const subirLogo = async (file: File, tenantId: string) => {
    setUploadingLogo(true)
    setLogoMsg('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tenant_id', tenantId)
      const res = await fetch('/api/admin/upload-logo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLogoMsg('Logo actualizado')
      await cargar()
      setTimeout(() => setLogoMsg(''), 3000)
    } catch (e: unknown) {
      setLogoMsg(e instanceof Error ? e.message : 'Error al subir')
    } finally {
      setUploadingLogo(false)
    }
  }

  const abrirEditar = (t: Tenant) => {
    setEditTenant(t)
    setEditNombre(t.nombre)
    setEditNombreHerramienta(t.nombre_herramienta ?? '')
    setEditDriveFolder(t.drive_folder_id ?? '')
    setEditDriveHabilitado(t.archivado_drive_habilitado)
  }

  const handleGuardarEdicion = async () => {
    if (!editTenant) return
    setEditSaving(true)
    try {
      await supabase.from('tenants').update({
        nombre: editNombre,
        nombre_herramienta: editNombreHerramienta || null,
        drive_folder_id: editDriveFolder || null,
        archivado_drive_habilitado: editDriveHabilitado,
      }).eq('id', editTenant.id)
      setEditTenant(null)
      await cargar()
    } finally {
      setEditSaving(false)
    }
  }

  const toggleActivo = async (id: string, activo: boolean) => {
    await supabase.from('tenants').update({ activo: !activo }).eq('id', id)
    setTenants((prev) => prev.map((t) => t.id === id ? { ...t, activo: !activo } : t))
  }

  const handleExport = async () => {
    if (!resetTenant) return
    setExportando(true)
    try {
      const res = await fetch('/api/admin/export-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: resetTenant.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `respaldo_${resetTenant.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setResetMsg({ tipo: 'err', texto: `Error exportando: ${err instanceof Error ? err.message : 'Error desconocido'}` })
    } finally {
      setExportando(false)
    }
  }

  const handleReset = async () => {
    if (!resetTenant) return
    setResetting(true)
    setResetMsg(null)
    try {
      const res = await fetch('/api/admin/reset-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: resetTenant.id, confirmar_nombre: resetConfirm, modo: resetModo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResetMsg({ tipo: 'ok', texto: data.mensaje })
      setResetConfirm('')
      await cargar()
    } catch (err: unknown) {
      setResetMsg({ tipo: 'err', texto: err instanceof Error ? err.message : 'Error desconocido' })
    } finally {
      setResetting(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando empresas...</div>

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
          <p className="text-sm text-gray-500">{tenants.filter((t) => t.activo).length} activas · {tenants.length} total</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Nueva empresa</Button>
      </div>

      {/* Lista de talleres */}
      <div className="space-y-3">
        {tenants.map((t) => (
          <div key={t.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!t.activo ? 'opacity-60 border-gray-100' : 'border-gray-200'}`}>
            {/* Fila principal */}
            <div className="flex items-center gap-4 px-5 py-4">
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0 ${t.activo ? 'bg-purple-700' : 'bg-gray-400'}`}>
                {t.nombre[0]}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900">{t.nombre}</p>
                  {t.nombre_herramienta && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                      {t.nombre_herramienta}
                    </span>
                  )}
                  {!t.activo && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactivo</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                  <span className="font-mono">{t.slug}</span>
                  <span>·</span>
                  <span>{t.usuarios_count ?? 0} usuario{(t.usuarios_count ?? 0) !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span className={`font-medium ${(t.ordenes_activas ?? 0) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                    {t.ordenes_activas ?? 0} activas
                  </span>
                  <span>·</span>
                  <span>{formatBytes(t.storage_usado_bytes)}</span>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => abrirEditar(t)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors font-medium"
                >
                  Configurar
                </button>
                <button
                  onClick={() => { setResetTenant(t); setResetConfirm(''); setResetMsg(null); setResetModo('completo') }}
                  className="px-3 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium"
                  title="Reiniciar todos los datos de esta empresa"
                >
                  Reiniciar
                </button>
                <button
                  onClick={() => setExpandido(expandido === t.id ? null : t.id)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                >
                  {expandido === t.id ? 'Ocultar' : 'Detalles'}
                </button>
                <button
                  onClick={() => toggleActivo(t.id, t.activo)}
                  className={`w-10 h-6 rounded-full transition-colors ${t.activo ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${t.activo ? 'translate-x-4' : ''}`} />
                </button>
              </div>
            </div>

            {/* Panel expandido */}
            {expandido === t.id && (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Nombre herramienta</p>
                  <p className="font-medium text-gray-800">{t.nombre_herramienta ?? 'No configurado'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Drive folder</p>
                  <p className={`font-medium ${t.drive_folder_id ? 'text-green-700' : 'text-amber-600'}`}>
                    {t.drive_folder_id ? '✓ Vinculado' : 'Sin vincular'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Archivado auto</p>
                  <p className={`font-medium ${t.archivado_drive_habilitado ? 'text-green-700' : 'text-gray-400'}`}>
                    {t.archivado_drive_habilitado ? 'Habilitado' : 'Deshabilitado'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Creado</p>
                  <p className="font-medium text-gray-800">{new Date(t.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal nuevo taller */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nueva empresa" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la empresa *</label>
            <input
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value)
                setSlug(e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
                setNombreHerramienta(`OptiDesk - ${e.target.value}`)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Ej: Motospace 38"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL)</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              placeholder="motospace-38"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre en la herramienta</label>
            <input
              value={nombreHerramienta}
              onChange={(e) => setNombreHerramienta(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="OptiDesk - Motospace38"
            />
            <p className="text-xs text-gray-400 mt-1">Aparece como título de la app para esta empresa</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleCreate} loading={saving} disabled={!nombre || !slug} className="flex-1">
              Crear empresa
            </Button>
            <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal reiniciar empresa */}
      {resetTenant && (
        <Modal open={true} onClose={() => { setResetTenant(null); setResetMsg(null) }} title="Reiniciar empresa" size="sm">
          <div className="space-y-4">
            {/* Opciones de reinicio */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">¿Qué deseas eliminar?</p>
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${resetModo === 'completo' ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="resetModo"
                  value="completo"
                  checked={resetModo === 'completo'}
                  onChange={() => setResetModo('completo')}
                  className="mt-0.5 accent-red-600"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Todo — inicio desde cero</p>
                  <p className="text-xs text-gray-500 mt-0.5">Borra órdenes, clientes, motos, repuestos, inventario y archivos. Solo se conservan los usuarios.</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${resetModo === 'operativo' ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="resetModo"
                  value="operativo"
                  checked={resetModo === 'operativo'}
                  onChange={() => setResetModo('operativo')}
                  className="mt-0.5 accent-amber-600"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Solo historial operativo</p>
                  <p className="text-xs text-gray-500 mt-0.5">Borra órdenes, repuestos e inventario. Conserva clientes, motos y usuarios — útil para cambiar de datos de prueba a producción.</p>
                </div>
              </label>
            </div>

            <div className={`p-3 rounded-xl border text-xs ${resetModo === 'completo' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              ⚠ Esta acción es <strong>irreversible</strong>. Descarga el respaldo primero.
            </div>

            <button
              onClick={handleExport}
              disabled={exportando}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              {exportando ? 'Descargando...' : '⬇ Descargar respaldo Excel antes de reiniciar'}
            </button>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Escribe <span className="font-mono font-bold text-red-700">{resetTenant.nombre}</span> para confirmar
              </label>
              <input
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none"
                placeholder={resetTenant.nombre}
              />
            </div>

            {resetMsg && (
              <div className={`p-3 rounded-lg text-sm ${resetMsg.tipo === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {resetMsg.texto}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleReset}
                disabled={resetting || resetConfirm.trim().toLowerCase() !== resetTenant.nombre.trim().toLowerCase()}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  resetConfirm.trim().toLowerCase() === resetTenant.nombre.trim().toLowerCase() && !resetting
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {resetting ? 'Reiniciando...' : 'Reiniciar datos'}
              </button>
              <Button variant="secondary" onClick={() => { setResetTenant(null); setResetMsg(null) }} className="flex-1">
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal editar taller */}
      {editTenant && (
        <Modal open={true} onClose={() => setEditTenant(null)} title={`Configurar: ${editTenant.nombre}`} size="sm">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre en la herramienta</label>
              <input
                value={editNombreHerramienta}
                onChange={(e) => setEditNombreHerramienta(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="OptiDesk - NombreTaller"
              />
              <p className="text-xs text-gray-400 mt-1">Título personalizado que ve el taller</p>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Logo de la empresa</p>
              <div className="flex items-center gap-4">
                {editTenant.logo_url ? (
                  <img src={editTenant.logo_url} alt="Logo" className="w-14 h-14 rounded-xl object-contain bg-gray-50 border border-gray-200" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">Sin logo</div>
                )}
                <div className="flex-1">
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${uploadingLogo ? 'border-gray-200 text-gray-400' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/svg+xml"
                      className="hidden"
                      disabled={uploadingLogo}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) subirLogo(f, editTenant.id)
                        e.target.value = ''
                      }}
                    />
                    {uploadingLogo ? 'Subiendo...' : 'Subir imagen'}
                  </label>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP o SVG · máx 3 MB</p>
                  {logoMsg && <p className={`text-xs mt-1 font-medium ${logoMsg.includes('Error') || logoMsg.includes('error') ? 'text-red-500' : 'text-green-600'}`}>{logoMsg}</p>}
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Vinculación Google Drive</p>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">ID o URL de la carpeta compartida</label>
                  <input
                    value={editDriveFolder}
                    onChange={(e) => {
                      // Extraer folder ID de una URL de Drive si se pega una URL completa
                      const match = e.target.value.match(/folders\/([a-zA-Z0-9_-]+)/)
                      setEditDriveFolder(match ? match[1] : e.target.value)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    placeholder="Pega el link de Drive o el folder ID"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Copia el link de la carpeta desde Drive → Compartir → Copiar enlace
                  </p>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm text-gray-700 font-medium">Archivado automático</p>
                    <p className="text-xs text-gray-400">Mueve a Drive cuando R2 supera 9 GB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditDriveHabilitado(!editDriveHabilitado)}
                    className={`w-10 h-6 rounded-full transition-colors ${editDriveHabilitado ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${editDriveHabilitado ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
                {editDriveFolder && (
                  <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                    ✓ Carpeta configurada: <span className="font-mono">{editDriveFolder.slice(0, 20)}...</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleGuardarEdicion} loading={editSaving} className="flex-1">
                Guardar
              </Button>
              <Button variant="secondary" onClick={() => setEditTenant(null)} className="flex-1">
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
