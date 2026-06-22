'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

/* ─── Tipos ─────────────────────────────────────────────── */
interface Subcategoria { id: string; nombre: string; activo: boolean }
interface Categoria { id: string; nombre: string; activo: boolean; subcategorias_servicio: Subcategoria[] }
interface MetodoPago { id: string; nombre: string; activo: boolean; recargo_porcentaje: number }
interface LavaMotoConfig { id?: string; costo: number; precio_venta: number; activo: boolean }

/* ─── Helpers ────────────────────────────────────────────── */
function ToggleSwitch({ activo, onChange }: { activo: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${activo ? 'bg-green-500' : 'bg-gray-300'}`}>
      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${activo ? 'translate-x-4' : ''}`} />
    </button>
  )
}

function PencilBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Renombrar">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
  )
}

function TrashBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-red-400 hover:text-red-600 transition-colors p-1" title="Eliminar">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════ */
export default function ConfigServicioPage() {
  const supabase = createClient()
  const { profile } = useAuth()

  /* ── Estado tipos de servicio ── */
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [nuevaCat, setNuevaCat] = useState('')
  const [nuevaSubcats, setNuevaSubcats] = useState<Record<string, string>>({})
  const [savingCat, setSavingCat] = useState(false)
  const [editandoCat, setEditandoCat] = useState<string | null>(null)
  const [editNombreCat, setEditNombreCat] = useState('')

  /* ── Estado métodos de pago ── */
  const [metodos, setMetodos] = useState<MetodoPago[]>([])
  const [nuevoMetodo, setNuevoMetodo] = useState('')
  const [savingMetodo, setSavingMetodo] = useState(false)
  const [editandoMetodo, setEditandoMetodo] = useState<string | null>(null)
  const [editNombreMetodo, setEditNombreMetodo] = useState('')

  const [loading, setLoading] = useState(true)

  /* ── Estado logo ── */
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoMsg, setLogoMsg] = useState<{ ok: boolean; text: string } | null>(null)

  /* ── Estado carga catálogo UMA ── */
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [modoUpload, setModoUpload] = useState<'agregar' | 'reemplazar'>('agregar')

  /* ── Estado carga catálogo Lubricantes ── */
  const [uploadFileLub, setUploadFileLub] = useState<File | null>(null)
  const [uploadingLub, setUploadingLub] = useState(false)
  const [uploadResultLub, setUploadResultLub] = useState<{ ok: boolean; msg: string } | null>(null)
  const [modoUploadLub, setModoUploadLub] = useState<'agregar' | 'reemplazar'>('agregar')

  /* ── Estado carga CSV Manuales de Partes ── */
  const [uploadFileManuales, setUploadFileManuales] = useState<File | null>(null)
  const [uploadingManuales, setUploadingManuales] = useState(false)
  const [uploadResultManuales, setUploadResultManuales] = useState<{ ok: boolean; msg: string } | null>(null)
  const [manualesCount, setManualesCount] = useState(0)

  /* ── Estado lava moto ── */
  const [lavaMotoConfig, setLavaMotoConfig] = useState<LavaMotoConfig>({ costo: 0, precio_venta: 0, activo: false })
  const [editingLavaMoto, setEditingLavaMoto] = useState(false)
  const [lavaCostoEdit, setLavaCostoEdit] = useState('')
  const [lavaPrecioEdit, setLavaPrecioEdit] = useState('')
  const [savingLavaMoto, setSavingLavaMoto] = useState(false)
  const [lavaMotoMsg, setLavaMotoMsg] = useState<{ ok: boolean; text: string } | null>(null)

  /* ── Estado migración de videos antiguos a mp4 ── */
  const [migrando, setMigrando] = useState(false)
  const [migProcesados, setMigProcesados] = useState(0)
  const [migRestantes, setMigRestantes] = useState<number | null>(null)
  const [migEnDrive, setMigEnDrive] = useState(0)
  const [migErrores, setMigErrores] = useState<{ id: string; error: string }[]>([])

  /* ── Carga ── */
  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    const [{ data: cats }, { data: mets }, { data: lmCfg }, { count: manualesCnt }] = await Promise.all([
      supabase.from('categorias_servicio')
        .select('id, nombre, activo, subcategorias_servicio(id, nombre, activo)')
        .eq('tenant_id', profile.tenant_id).order('orden'),
      supabase.from('metodos_pago')
        .select('id, nombre, activo, recargo_porcentaje')
        .eq('tenant_id', profile.tenant_id).order('nombre'),
      supabase.from('lava_moto_config')
        .select('id, costo, precio_venta, activo')
        .eq('tenant_id', profile.tenant_id).maybeSingle(),
      supabase.from('manuales_partes')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', profile.tenant_id),
    ])
    setCategorias((cats as Categoria[]) ?? [])
    setMetodos((mets as MetodoPago[]) ?? [])
    setLavaMotoConfig((lmCfg as LavaMotoConfig | null) ?? { costo: 0, precio_venta: 0, activo: false })
    setManualesCount(manualesCnt ?? 0)
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('tenants').select('logo_url').eq('id', profile.tenant_id).single()
      .then(({ data }) => setLogoUrl(data?.logo_url ?? null))
  }, [profile?.tenant_id])

  const subirLogo = async (file: File) => {
    if (!profile?.tenant_id) return
    setUploadingLogo(true)
    setLogoMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tenant_id', profile.tenant_id)
      const res = await fetch('/api/admin/upload-logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setLogoMsg({ ok: false, text: json.error ?? 'Error al subir el logo' })
      } else {
        setLogoUrl(json.logo_url)
        setLogoMsg({ ok: true, text: 'Logo actualizado correctamente' })
      }
    } catch {
      setLogoMsg({ ok: false, text: 'Error de conexión' })
    } finally {
      setUploadingLogo(false)
    }
  }

  /* ── Categorías: acciones ── */
  const addCategoria = async () => {
    if (!nuevaCat.trim() || !profile?.tenant_id) return
    setSavingCat(true)
    await supabase.from('categorias_servicio').insert({
      tenant_id: profile.tenant_id, nombre: nuevaCat.trim(), orden: categorias.length + 1,
    })
    setNuevaCat('')
    await cargar()
    setSavingCat(false)
  }

  const deleteCategoria = async (id: string) => {
    if (!confirm('¿Eliminar este tipo de servicio?')) return
    await supabase.from('categorias_servicio').delete().eq('id', id)
    await cargar()
  }

  const toggleCat = async (id: string, activo: boolean) => {
    await supabase.from('categorias_servicio').update({ activo: !activo }).eq('id', id)
    setCategorias((prev) => prev.map((c) => c.id === id ? { ...c, activo: !activo } : c))
  }

  const guardarNombreCat = async (id: string) => {
    if (!editNombreCat.trim()) return
    await supabase.from('categorias_servicio').update({ nombre: editNombreCat.trim() }).eq('id', id)
    setEditandoCat(null)
    await cargar()
  }

  const addSubcategoria = async (categoriaId: string) => {
    const nombre = (nuevaSubcats[categoriaId] ?? '').trim()
    if (!nombre) return
    await supabase.from('subcategorias_servicio').insert({ categoria_id: categoriaId, nombre, orden: 99 })
    setNuevaSubcats((p) => ({ ...p, [categoriaId]: '' }))
    await cargar()
  }

  const deleteSubcategoria = async (id: string) => {
    await supabase.from('subcategorias_servicio').delete().eq('id', id)
    await cargar()
  }

  const toggleSub = async (id: string, activo: boolean) => {
    await supabase.from('subcategorias_servicio').update({ activo: !activo }).eq('id', id)
    await cargar()
  }

  /* ── Métodos de pago: acciones ── */
  const addMetodo = async () => {
    if (!nuevoMetodo.trim() || !profile?.tenant_id) return
    setSavingMetodo(true)
    await supabase.from('metodos_pago').insert({
      tenant_id: profile.tenant_id, nombre: nuevoMetodo.trim(), activo: true,
    })
    setNuevoMetodo('')
    await cargar()
    setSavingMetodo(false)
  }

  const deleteMetodo = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return
    await supabase.from('metodos_pago').delete().eq('id', id)
    await cargar()
  }

  const toggleMetodo = async (id: string, activo: boolean) => {
    await supabase.from('metodos_pago').update({ activo: !activo }).eq('id', id)
    setMetodos((prev) => prev.map((m) => m.id === id ? { ...m, activo: !activo } : m))
  }

  const guardarNombreMetodo = async (id: string) => {
    if (!editNombreMetodo.trim()) return
    await supabase.from('metodos_pago').update({ nombre: editNombreMetodo.trim() }).eq('id', id)
    setEditandoMetodo(null)
    await cargar()
  }

  const guardarRecargoMetodo = async (id: string, recargo: string) => {
    const valor = recargo ? parseFloat(recargo) : 0
    await supabase.from('metodos_pago').update({ recargo_porcentaje: valor }).eq('id', id)
    setMetodos((prev) => prev.map((m) => m.id === id ? { ...m, recargo_porcentaje: valor } : m))
  }

  /* ── Lava moto: acciones ── */
  const toggleLavaMoto = async () => {
    if (!profile?.tenant_id) return
    const newActivo = !lavaMotoConfig.activo
    const { error } = await supabase.from('lava_moto_config')
      .upsert({
        tenant_id: profile.tenant_id,
        activo: newActivo,
        costo: lavaMotoConfig.costo,
        precio_venta: lavaMotoConfig.precio_venta,
      }, { onConflict: 'tenant_id' })
    if (error) {
      setLavaMotoMsg({ ok: false, text: 'Error al cambiar estado: ' + error.message })
      return
    }
    await cargar()
  }

  const guardarLavaMoto = async () => {
    if (!profile?.tenant_id) return
    const costo = parseInt(lavaCostoEdit || '0', 10) || 0
    const precio_venta = parseInt(lavaPrecioEdit || '0', 10) || 0
    setSavingLavaMoto(true)
    const { error } = await supabase.from('lava_moto_config')
      .upsert({
        tenant_id: profile.tenant_id,
        costo,
        precio_venta,
        activo: lavaMotoConfig.activo,
      }, { onConflict: 'tenant_id' })
    setSavingLavaMoto(false)
    if (error) {
      setLavaMotoMsg({ ok: false, text: 'Error al guardar: ' + error.message })
      return
    }
    await cargar()
    setEditingLavaMoto(false)
    setLavaMotoMsg({ ok: true, text: 'Precios actualizados correctamente' })
    setTimeout(() => setLavaMotoMsg(null), 3000)
  }

  /* ── Migrar videos antiguos (ya subidos antes del cambio) a mp4 ── */
  const migrarVideosAntiguos = async () => {
    setMigrando(true)
    setMigProcesados(0)
    setMigErrores([])
    try {
      let restantes = 1
      while (restantes > 0) {
        const res = await fetch('/api/admin/migrar-videos-mp4', { method: 'POST' })
        const json = await res.json()
        if (!res.ok) {
          setMigErrores((prev) => [...prev, { id: '-', error: json.error ?? 'Error al migrar' }])
          break
        }
        setMigProcesados((prev) => prev + json.procesados)
        setMigEnDrive(json.enDrive ?? 0)
        setMigErrores((prev) => [...prev, ...(json.errores ?? [])])
        restantes = json.restantes ?? 0
        setMigRestantes(restantes)
        if (json.procesados === 0 && json.errores?.length > 0) break
      }
    } finally {
      setMigrando(false)
    }
  }

  const handleUploadRepuestos = async () => {
    if (!uploadFile || !profile?.tenant_id) return
    if (modoUpload === 'reemplazar' && !confirm('Esto eliminará todo el catálogo de repuestos UMA actual antes de cargar el nuevo archivo. ¿Continuar?')) return
    setUploading(true)
    setUploadResult(null)
    try {
      const urlRes = await fetch('/api/repuestos-uma/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadFile.name }),
      })
      const urlJson = await urlRes.json()
      if (!urlRes.ok) {
        setUploadResult({ ok: false, msg: urlJson.error ?? 'Error al preparar la subida' })
        return
      }
      const { path, token } = urlJson

      const { error: uploadError } = await supabase.storage.from('catalogos-temp').uploadToSignedUrl(path, token, uploadFile)
      if (uploadError) {
        setUploadResult({ ok: false, msg: 'Error al subir el archivo' })
        return
      }

      const res = await fetch('/api/repuestos-uma/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, modo: modoUpload }),
      })
      const json = await res.json()
      if (!res.ok) {
        setUploadResult({ ok: false, msg: json.error ?? 'Error al procesar el archivo' })
      } else {
        const dupMsg = json.duplicados > 0 ? ` (${json.duplicados} referencias duplicadas omitidas)` : ''
        setUploadResult({ ok: true, msg: `✓ ${json.insertados.toLocaleString()} repuestos actualizados de ${json.total.toLocaleString()}${dupMsg}` })
        setUploadFile(null)
      }
    } catch {
      setUploadResult({ ok: false, msg: 'Error de conexión' })
    } finally {
      setUploading(false)
    }
  }

  const handleUploadLubricantes = async () => {
    if (!uploadFileLub || !profile?.tenant_id) return
    if (modoUploadLub === 'reemplazar' && !confirm('Esto eliminará todo el catálogo de lubricantes actual antes de cargar el nuevo archivo. ¿Continuar?')) return
    setUploadingLub(true)
    setUploadResultLub(null)
    try {
      const urlRes = await fetch('/api/lubricantes/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadFileLub.name }),
      })
      const urlJson = await urlRes.json()
      if (!urlRes.ok) {
        setUploadResultLub({ ok: false, msg: urlJson.error ?? 'Error al preparar la subida' })
        return
      }
      const { path, token } = urlJson

      const { error: uploadError } = await supabase.storage.from('catalogos-temp').uploadToSignedUrl(path, token, uploadFileLub)
      if (uploadError) {
        setUploadResultLub({ ok: false, msg: 'Error al subir el archivo' })
        return
      }

      const res = await fetch('/api/lubricantes/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, modo: modoUploadLub }),
      })
      const json = await res.json()
      if (!res.ok) {
        setUploadResultLub({ ok: false, msg: json.error ?? 'Error al procesar el archivo' })
      } else {
        const dupMsg = json.duplicados > 0 ? ` (${json.duplicados} referencias duplicadas omitidas)` : ''
        setUploadResultLub({ ok: true, msg: `✓ ${json.insertados.toLocaleString()} lubricantes actualizados de ${json.total.toLocaleString()}${dupMsg}` })
        setUploadFileLub(null)
      }
    } catch {
      setUploadResultLub({ ok: false, msg: 'Error de conexión' })
    } finally {
      setUploadingLub(false)
    }
  }

  /* ── Manuales de Partes: subir Excel (columnas MANUAL, CARPETA, LINK DRIVE) ──
     El archivo solo se lee en el navegador (FileReader + XLSX) para extraer los
     valores; nunca se sube a ningún storage. Cada carga reemplaza por completo
     la lista anterior del tenant. */
  const leerExcel = (file: File): Promise<Record<string, string>[]> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = e.target?.result
          const wb = XLSX.read(data, { type: 'array' })
          const sheet = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '', raw: false })
          resolve(rows)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
      reader.readAsArrayBuffer(file)
    })

  const handleUploadManuales = async () => {
    if (!uploadFileManuales || !profile?.tenant_id) return
    setUploadingManuales(true)
    setUploadResultManuales(null)
    try {
      const rows = await leerExcel(uploadFileManuales)
      if (rows.length === 0) throw new Error('El archivo no tiene filas de datos.')

      const claves = Object.keys(rows[0])
      const claveNombre = claves.find(k => k.trim().toUpperCase() === 'MANUAL')
      const claveCarpeta = claves.find(k => k.trim().toUpperCase() === 'CARPETA')
      const claveLink = claves.find(k => k.trim().toUpperCase() === 'LINK DRIVE')
      if (!claveNombre || !claveCarpeta || !claveLink) {
        throw new Error('El Excel debe tener las columnas: MANUAL, CARPETA, LINK DRIVE')
      }

      const registros: { tenant_id: string; nombre: string; carpeta: string; link: string }[] = []
      for (const r of rows) {
        const nombre = String(r[claveNombre] ?? '').trim()
        const carpeta = String(r[claveCarpeta] ?? '').trim()
        const link = String(r[claveLink] ?? '').trim()
        if (!nombre && !carpeta && !link) continue
        if (!nombre || !link) throw new Error(`Falta MANUAL o LINK DRIVE en una fila (carpeta "${carpeta}").`)
        if (carpeta !== 'Motocarros' && carpeta !== 'Motocicletas') {
          throw new Error(`La carpeta "${carpeta}" de "${nombre}" no es válida (debe ser Motocarros o Motocicletas).`)
        }
        registros.push({ tenant_id: profile.tenant_id, nombre, carpeta, link })
      }
      if (registros.length === 0) throw new Error('No se encontraron filas válidas en el archivo.')

      const { error: delError } = await supabase.from('manuales_partes').delete().eq('tenant_id', profile.tenant_id)
      if (delError) throw new Error(delError.message)
      const { error: insError } = await supabase.from('manuales_partes').insert(registros)
      if (insError) throw new Error(insError.message)

      setUploadResultManuales({ ok: true, msg: `✓ Se cargaron ${registros.length} manuales correctamente.` })
      setUploadFileManuales(null)
      setManualesCount(registros.length)
    } catch (e: unknown) {
      setUploadResultManuales({ ok: false, msg: e instanceof Error ? e.message : 'Error al cargar el archivo.' })
    } finally {
      setUploadingManuales(false)
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Cargando...</div>

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Config Servicio Técnico</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona los tipos de servicio y métodos de pago disponibles en el taller.
        </p>
      </div>

      {/* ── Logo del negocio ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Logo del negocio</h2>
            <p className="text-xs text-gray-400">Aparece en el menú lateral de la aplicación</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo actual"
              className="w-20 h-20 rounded-xl object-contain bg-gray-50 border border-gray-200 flex-shrink-0"
              onError={() => setLogoUrl(null)} />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs flex-shrink-0">
              Sin logo
            </div>
          )}
          <div className="flex-1">
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
              uploadingLogo
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-700 hover:bg-blue-800 text-white'
            }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="hidden"
                disabled={uploadingLogo}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) subirLogo(f) }} />
              {uploadingLogo ? 'Subiendo...' : 'Cambiar logo'}
            </label>
            <p className="text-xs text-gray-400 mt-2">JPG, PNG, WebP o SVG · máx 3 MB</p>
            {logoMsg && (
              <p className={`text-xs mt-2 font-medium ${logoMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {logoMsg.text}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ══════════════════════════════════════════
            COLUMNA 1 — TIPOS DE SERVICIO
        ══════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Tipos de servicio</h2>
              <p className="text-xs text-gray-400">Aparecen como botones al crear una recepción</p>
            </div>
          </div>

          <div className="space-y-2">
            {categorias.length === 0 && (
              <p className="text-sm text-gray-400 italic">Sin tipos de servicio.</p>
            )}
            {categorias.map((cat) => (
              <div key={cat.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!cat.activo ? 'opacity-60' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                  {editandoCat === cat.id ? (
                    <>
                      <input value={editNombreCat} onChange={(e) => setEditNombreCat(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarNombreCat(cat.id); if (e.key === 'Escape') setEditandoCat(null) }}
                        autoFocus className="flex-1 px-2 py-1 border border-blue-400 rounded-lg text-sm font-semibold focus:outline-none" />
                      <button onClick={() => guardarNombreCat(cat.id)}
                        className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Guardar</button>
                      <button onClick={() => setEditandoCat(null)}
                        className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 font-semibold text-gray-900 text-sm">{cat.nombre}</span>
                      <PencilBtn onClick={() => { setEditandoCat(cat.id); setEditNombreCat(cat.nombre) }} />
                      <ToggleSwitch activo={cat.activo} onChange={() => toggleCat(cat.id, cat.activo)} />
                      <TrashBtn onClick={() => deleteCategoria(cat.id)} />
                    </>
                  )}
                </div>
                <div className="px-4 py-3 space-y-2">
                  {cat.subcategorias_servicio.map((sub) => (
                    <div key={sub.id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 ${!sub.activo ? 'opacity-50' : ''}`}>
                      <span className="text-sm text-gray-700">{sub.nombre}</span>
                      <div className="flex items-center gap-2">
                        <ToggleSwitch activo={sub.activo} onChange={() => toggleSub(sub.id, sub.activo)} />
                        <button onClick={() => deleteSubcategoria(sub.id)} className="text-red-400 hover:text-red-600">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <input value={nuevaSubcats[cat.id] ?? ''}
                      onChange={(e) => setNuevaSubcats((p) => ({ ...p, [cat.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addSubcategoria(cat.id)}
                      placeholder="Agregar subcategoría..."
                      className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <button onClick={() => addSubcategoria(cat.id)} disabled={!nuevaSubcats[cat.id]?.trim()}
                      className="px-2 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded-lg text-xs font-semibold">+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Agregar categoría */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Nuevo tipo</p>
            <div className="flex gap-2">
              <input value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCategoria()}
                placeholder="Ej: Garantía, Cambio Aceite..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <button onClick={addCategoria} disabled={savingCat || !nuevaCat.trim()}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-200 text-white rounded-lg text-sm font-semibold transition-colors">
                {savingCat ? '...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            COLUMNA 2 — MÉTODOS DE PAGO
        ══════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Métodos de pago</h2>
              <p className="text-xs text-gray-400">Aparecen al registrar el pago de una orden</p>
            </div>
          </div>

          {metodos.length > 0 && (
            <p className="text-xs text-gray-400 -mb-1">
              El campo "% recargo" se suma al total cuando el cliente paga con ese método (ej. 5% en Datáfono o Tarjeta de crédito) — se usa en Seguimiento Ventas.
            </p>
          )}

          <div className="space-y-2">
            {metodos.length === 0 && (
              <p className="text-sm text-gray-400 italic">Sin métodos de pago.</p>
            )}
            {metodos.map((m) => (
              <div key={m.id} className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-2 shadow-sm ${!m.activo ? 'opacity-60' : 'border-gray-200'}`}>
                {editandoMetodo === m.id ? (
                  <>
                    <input value={editNombreMetodo} onChange={(e) => setEditNombreMetodo(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') guardarNombreMetodo(m.id); if (e.key === 'Escape') setEditandoMetodo(null) }}
                      autoFocus className="flex-1 px-2 py-1 border border-blue-400 rounded-lg text-sm font-semibold focus:outline-none" />
                    <button onClick={() => guardarNombreMetodo(m.id)}
                      className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold">Guardar</button>
                    <button onClick={() => setEditandoMetodo(null)}
                      className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-semibold text-gray-900 text-sm">{m.nombre}</span>
                    <input type="number" defaultValue={m.recargo_porcentaje || ''} placeholder="0%"
                      onBlur={(e) => guardarRecargoMetodo(m.id, e.target.value)}
                      title="Recargo % (ej. datáfono, tarjeta de crédito)"
                      className="w-14 px-1.5 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <PencilBtn onClick={() => { setEditandoMetodo(m.id); setEditNombreMetodo(m.nombre) }} />
                    <ToggleSwitch activo={m.activo} onChange={() => toggleMetodo(m.id, m.activo)} />
                    <TrashBtn onClick={() => deleteMetodo(m.id, m.nombre)} />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Agregar método */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Nuevo método</p>
            <div className="flex gap-2">
              <input value={nuevoMetodo} onChange={(e) => setNuevoMetodo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMetodo()}
                placeholder="Ej: Efectivo, Nequi, Transferencia..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <button onClick={addMetodo} disabled={savingMetodo || !nuevoMetodo.trim()}
                className="px-4 py-2 bg-green-700 hover:bg-green-800 disabled:bg-green-200 text-white rounded-lg text-sm font-semibold transition-colors">
                {savingMetodo ? '...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════
          SECCIÓN LAVA MOTO
      ══════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Servicio Lava Moto</h2>
              <p className="text-xs text-gray-400">
                Costo al proveedor y precio de venta al cliente · {lavaMotoConfig.activo ? 'Activo' : 'Inactivo'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {profile?.rol === 'gerencia' && !editingLavaMoto && (
              <button
                onClick={() => {
                  setLavaCostoEdit(String(Math.round(lavaMotoConfig.costo)))
                  setLavaPrecioEdit(String(Math.round(lavaMotoConfig.precio_venta)))
                  setEditingLavaMoto(true)
                }}
                className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                title="Editar precios"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            <button
              onClick={profile?.rol === 'gerencia' ? toggleLavaMoto : undefined}
              disabled={profile?.rol !== 'gerencia'}
              className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${lavaMotoConfig.activo ? 'bg-green-500' : 'bg-gray-300'} ${profile?.rol !== 'gerencia' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${lavaMotoConfig.activo ? 'translate-x-4' : ''}`} />
            </button>
          </div>
        </div>

        {editingLavaMoto && profile?.rol === 'gerencia' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Costo proveedor ($)</label>
                <input
                  type="text" inputMode="numeric"
                  value={lavaCostoEdit ? '$' + Number(lavaCostoEdit).toLocaleString('es-CO') : ''}
                  onChange={(e) => setLavaCostoEdit(e.target.value.replace(/\D/g, ''))}
                  placeholder="$0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Precio de venta ($)</label>
                <input
                  type="text" inputMode="numeric"
                  value={lavaPrecioEdit ? '$' + Number(lavaPrecioEdit).toLocaleString('es-CO') : ''}
                  onChange={(e) => setLavaPrecioEdit(e.target.value.replace(/\D/g, ''))}
                  placeholder="$0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingLavaMoto(false)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">
                Cancelar
              </button>
              <button onClick={guardarLavaMoto} disabled={savingLavaMoto}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-lg text-xs font-semibold transition-colors">
                {savingLavaMoto ? 'Guardando...' : 'Guardar precios'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Costo proveedor</p>
              <p className="text-xl font-bold text-gray-900 font-mono">
                ${lavaMotoConfig.costo.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="bg-cyan-50 rounded-lg px-4 py-3">
              <p className="text-xs text-cyan-500 mb-1">Precio de venta</p>
              <p className="text-xl font-bold text-cyan-700 font-mono">
                ${lavaMotoConfig.precio_venta.toLocaleString('es-CO')}
              </p>
            </div>
          </div>
        )}

        {profile?.rol !== 'gerencia' && (
          <p className="text-xs text-gray-400 mt-3">Solo el rol Gerencia puede modificar estos precios.</p>
        )}
        {lavaMotoMsg && (
          <p className={`text-xs mt-3 font-medium ${lavaMotoMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
            {lavaMotoMsg.ok ? '✓' : '✗'} {lavaMotoMsg.text}
          </p>
        )}
      </div>

      {/* ══════════════════════════════════════════
          SECCIÓN 3 — CATÁLOGO REPUESTOS UMA
      ══════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Catálogo Repuestos UMA</h2>
            <p className="text-xs text-gray-500">
              Carga el Excel de precios UMA. Se actualizan todos los repuestos por referencia — hoja &quot;Pedido&quot;, fila 12 en adelante.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <label className="flex-1 cursor-pointer">
              <div className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl transition-colors ${
                uploadFile ? 'border-purple-400 bg-purple-50' : 'border-gray-300 hover:border-purple-300 hover:bg-purple-50/50'
              }`}>
                <svg className="w-5 h-5 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <div className="min-w-0">
                  {uploadFile ? (
                    <>
                      <p className="text-sm font-semibold text-purple-800 truncate">{uploadFile.name}</p>
                      <p className="text-xs text-purple-600">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-700">Seleccionar archivo Excel</p>
                      <p className="text-xs text-gray-400">FORMATO REPUESTOS UMA .xlsx / .xlsm</p>
                    </>
                  )}
                </div>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm"
                className="sr-only"
                onChange={(e) => {
                  setUploadFile(e.target.files?.[0] ?? null)
                  setUploadResult(null)
                }}
              />
            </label>

            <button
              onClick={handleUploadRepuestos}
              disabled={!uploadFile || uploading}
              className="px-5 py-3 bg-purple-700 hover:bg-purple-800 disabled:bg-purple-200 text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Procesando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Cargar catálogo
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">Al cargar:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="modoUpload" checked={modoUpload === 'agregar'}
                onChange={() => setModoUpload('agregar')} className="accent-purple-600" />
              <span className="text-gray-700">Añadir / actualizar</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="modoUpload" checked={modoUpload === 'reemplazar'}
                onChange={() => setModoUpload('reemplazar')} className="accent-purple-600" />
              <span className="text-gray-700">Reemplazar todo</span>
            </label>
          </div>

          {uploadResult && (
            <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm ${
              uploadResult.ok
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <span className="flex-shrink-0 mt-0.5">{uploadResult.ok ? '✓' : '✗'}</span>
              <span>{uploadResult.msg}</span>
            </div>
          )}

          <p className="text-xs text-gray-400">
            El proceso puede tardar 1-2 minutos para archivos con +18.000 repuestos. No cierres la página durante la carga.
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          SECCIÓN 4 — CATÁLOGO LUBRICANTES
      ══════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Catálogo Lubricantes</h2>
            <p className="text-xs text-gray-500">
              Carga el Excel de precios de lubricantes (&quot;SUGERIDO LUBRICANTES DEALER&quot;) — hoja &quot;Lista de Precios&quot;.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <label className="flex-1 cursor-pointer">
              <div className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl transition-colors ${
                uploadFileLub ? 'border-amber-400 bg-amber-50' : 'border-gray-300 hover:border-amber-300 hover:bg-amber-50/50'
              }`}>
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <div className="min-w-0">
                  {uploadFileLub ? (
                    <>
                      <p className="text-sm font-semibold text-amber-800 truncate">{uploadFileLub.name}</p>
                      <p className="text-xs text-amber-600">{(uploadFileLub.size / 1024 / 1024).toFixed(1)} MB</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-700">Seleccionar archivo Excel</p>
                      <p className="text-xs text-gray-400">FORMATO SUGERIDO LUBRICANTES .xlsx/.xlsm</p>
                    </>
                  )}
                </div>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm"
                className="sr-only"
                onChange={(e) => {
                  setUploadFileLub(e.target.files?.[0] ?? null)
                  setUploadResultLub(null)
                }}
              />
            </label>

            <button
              onClick={handleUploadLubricantes}
              disabled={!uploadFileLub || uploadingLub}
              className="px-5 py-3 bg-amber-700 hover:bg-amber-800 disabled:bg-amber-200 text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-2"
            >
              {uploadingLub ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Procesando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Cargar catálogo
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">Al cargar:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="modoUploadLub" checked={modoUploadLub === 'agregar'}
                onChange={() => setModoUploadLub('agregar')} className="accent-amber-600" />
              <span className="text-gray-700">Añadir / actualizar</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="modoUploadLub" checked={modoUploadLub === 'reemplazar'}
                onChange={() => setModoUploadLub('reemplazar')} className="accent-amber-600" />
              <span className="text-gray-700">Reemplazar todo</span>
            </label>
          </div>

          {uploadResultLub && (
            <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm ${
              uploadResultLub.ok
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <span className="flex-shrink-0 mt-0.5">{uploadResultLub.ok ? '✓' : '✗'}</span>
              <span>{uploadResultLub.msg}</span>
            </div>
          )}

          <p className="text-xs text-gray-400">
            El proceso puede tardar 1-2 minutos para archivos grandes. No cierres la página durante la carga.
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          SECCIÓN — MANUALES DE PARTES (CSV)
      ══════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Manuales de Partes</h2>
            <p className="text-xs text-gray-500">
              Catálogo de manuales (PDF de Drive) que se ve desde &quot;Ver Manuales de Partes&quot; en Servicio Técnico. Actualmente hay {manualesCount} manual(es) cargados.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Sube un Excel con las columnas <strong>MANUAL</strong> (nombre del archivo), <strong>CARPETA</strong> (&quot;Motocarros&quot; o &quot;Motocicletas&quot;) y <strong>LINK DRIVE</strong> (link del PDF compartido en Drive). El archivo solo se lee en el navegador para tomar los datos, no se guarda. Cada carga reemplaza por completo la lista anterior — vuelve a subir el archivo cada vez que agregues, renombres o elimines un manual en Drive.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <label className="flex-1 cursor-pointer">
              <div className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl transition-colors ${
                uploadFileManuales ? 'border-rose-400 bg-rose-50' : 'border-gray-300 hover:border-rose-300 hover:bg-rose-50/50'
              }`}>
                <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <div className="min-w-0">
                  {uploadFileManuales ? (
                    <>
                      <p className="text-sm font-semibold text-rose-800 truncate">{uploadFileManuales.name}</p>
                      <p className="text-xs text-rose-600">{(uploadFileManuales.size / 1024).toFixed(0)} KB</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-700">Seleccionar archivo Excel</p>
                      <p className="text-xs text-gray-400">MANUAL, CARPETA, LINK DRIVE (.xlsx/.xls)</p>
                    </>
                  )}
                </div>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                onChange={(e) => {
                  setUploadFileManuales(e.target.files?.[0] ?? null)
                  setUploadResultManuales(null)
                }}
              />
            </label>

            <button
              onClick={handleUploadManuales}
              disabled={!uploadFileManuales || uploadingManuales}
              className="px-5 py-3 bg-rose-700 hover:bg-rose-800 disabled:bg-rose-200 text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-2"
            >
              {uploadingManuales ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Procesando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Cargar catálogo
                </>
              )}
            </button>
          </div>

          {uploadResultManuales && (
            <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm ${
              uploadResultManuales.ok
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <span className="flex-shrink-0 mt-0.5">{uploadResultManuales.ok ? '✓' : '✗'}</span>
              <span>{uploadResultManuales.msg}</span>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          SECCIÓN — CONVERTIR VIDEOS ANTIGUOS A MP4
      ══════════════════════════════════════════ */}
      {['admin', 'gerencia', 'control_total'].includes(profile?.rol ?? '') && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Convertir videos antiguos a MP4</h2>
              <p className="text-xs text-gray-500">
                Los videos nuevos de Servicio Técnico ya se guardan siempre en .mp4. Usa esto una sola vez para convertir también los que se subieron antes de ese cambio.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <button
              onClick={migrarVideosAntiguos}
              disabled={migrando}
              className="px-5 py-3 bg-indigo-700 hover:bg-indigo-800 disabled:bg-indigo-200 text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-2"
            >
              {migrando ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Convirtiendo... ({migProcesados} listos)
                </>
              ) : (
                'Convertir videos antiguos'
              )}
            </button>

            {migRestantes === 0 && !migrando && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg text-sm bg-green-50 text-green-800 border border-green-200">
                <span className="flex-shrink-0 mt-0.5">✓</span>
                <span>Listo, {migProcesados} video(s) convertidos a mp4.</span>
              </div>
            )}

            {migEnDrive > 0 && (
              <p className="text-xs text-gray-400">
                Hay {migEnDrive} video(s) archivados en Google Drive que no se tocan aquí (requieren otro proceso aparte).
              </p>
            )}

            {migErrores.length > 0 && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
                <span className="flex-shrink-0 mt-0.5">✗</span>
                <span>{migErrores.length} video(s) no se pudieron convertir. Puedes volver a intentar.</span>
              </div>
            )}

            <p className="text-xs text-gray-400">
              Procesa los videos en lotes pequeños, así que puede tardar varios minutos si hay muchos. No cierres la página mientras dice &quot;Convirtiendo...&quot;.
            </p>
          </div>
        </div>
      )}

    </div>
  )
}
