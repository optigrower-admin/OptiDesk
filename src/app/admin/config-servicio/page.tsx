'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

/* ─── Tipos ─────────────────────────────────────────────── */
interface Subcategoria { id: string; nombre: string; activo: boolean }
interface Categoria { id: string; nombre: string; activo: boolean; subcategorias_servicio: Subcategoria[] }
interface MetodoPago { id: string; nombre: string; activo: boolean; recargo_porcentaje: number }
interface LavaMotoConfig { id?: string; costo: number; precio_venta: number; activo: boolean }
interface RepuestoUMAEdit {
  id: string
  codigo: string
  descripcion: string
  subgrupo: string | null
  precio_publico_iva: number | null
  tipo: 'repuesto' | 'lubricante'
  activo: boolean
}

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
function ConfigServicioContent() {
  const searchParams = useSearchParams()

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

  /* ── Config cotizaciones S.T. ── */
  const [servtecTel1, setServtecTel1]       = useState('')
  const [servtecTel2, setServtecTel2]       = useState('')
  const [servtecEmail, setServtecEmail]     = useState('')
  const [servtecMsg, setServtecMsg]         = useState('')
  const [savingServtec, setSavingServtec]   = useState(false)
  const [servtecOk, setServtecOk]           = useState(false)

  /* ── Estado lava moto ── */
  const [lavaMotoConfig, setLavaMotoConfig] = useState<LavaMotoConfig>({ costo: 0, precio_venta: 0, activo: false })
  const [editingLavaMoto, setEditingLavaMoto] = useState(false)
  const [lavaCostoEdit, setLavaCostoEdit] = useState('')
  const [lavaPrecioEdit, setLavaPrecioEdit] = useState('')
  const [savingLavaMoto, setSavingLavaMoto] = useState(false)
  const [lavaMotoMsg, setLavaMotoMsg] = useState<{ ok: boolean; text: string } | null>(null)

  /* ── Estado catálogo UMA editable ── */
  const [catalogTab, setCatalogTab]     = useState<'repuesto' | 'lubricante'>('repuesto')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogItems, setCatalogItems] = useState<RepuestoUMAEdit[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [editCatalog, setEditCatalog]   = useState<{ id: string; codigo: string; descripcion: string; precio: string } | null>(null)
  const [confirmCatalog, setConfirmCatalog] = useState<{
    id: string
    original: { codigo: string; descripcion: string; precio: number | null }
    nuevo: { codigo: string; descripcion: string; precio: string }
  } | null>(null)
  const [savingCatalog, setSavingCatalog] = useState(false)

  /* ── Estado Google Drive ── */
  const [driveConectado, setDriveConectado] = useState(false)
  const [driveFolderInput, setDriveFolderInput] = useState('')
  const [driveFolderGuardado, setDriveFolderGuardado] = useState<string | null>(null)
  const [savingDriveFolder, setSavingDriveFolder] = useState(false)
  const [disconnectingDrive, setDisconnectingDrive] = useState(false)
  const [driveMsg, setDriveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [driveParaNuevas, setDriveParaNuevas] = useState(true)
  /* migración R2 → Drive */
  const [migDrive, setMigDrive] = useState(false)
  const [migDriveR2, setMigDriveR2] = useState<number | null>(null)
  const [migDriveEnDrive, setMigDriveEnDrive] = useState(0)
  const [migDriveProcesados, setMigDriveProcesados] = useState(0)
  const [migDriveErrores, setMigDriveErrores] = useState<{ id: string; nombre: string; error: string }[]>([])

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

  const cargarCatalogo = useCallback(async () => {
    if (!profile?.tenant_id) return
    setCatalogLoading(true)
    const base = supabase.from('repuestos_uma')
      .select('id, codigo, descripcion, subgrupo, precio_publico_iva, tipo, activo')
      .eq('tenant_id', profile.tenant_id).eq('tipo', catalogTab).order('codigo').limit(300)
    const q = catalogSearch.trim()
      ? base.or(`codigo.ilike.%${catalogSearch.trim()}%,descripcion.ilike.%${catalogSearch.trim()}%`)
      : base
    const { data } = await q
    setCatalogItems((data as RepuestoUMAEdit[]) ?? [])
    setCatalogLoading(false)
  }, [profile?.tenant_id, catalogTab, catalogSearch])

  useEffect(() => { cargarCatalogo() }, [cargarCatalogo])

  const guardarCatalogItem = async () => {
    if (!confirmCatalog || !profile?.tenant_id) return
    setSavingCatalog(true)
    const nuevoPrecio = parseInt(confirmCatalog.nuevo.precio.replace(/\D/g, ''), 10) || null
    await supabase.from('repuestos_uma').update({
      codigo: confirmCatalog.nuevo.codigo.trim(),
      descripcion: confirmCatalog.nuevo.descripcion.trim(),
      precio_publico_iva: nuevoPrecio,
    }).eq('id', confirmCatalog.id).eq('tenant_id', profile.tenant_id)
    setSavingCatalog(false)
    setConfirmCatalog(null)
    setEditCatalog(null)
    await cargarCatalogo()
  }

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('tenants')
      .select('logo_url, google_refresh_token, drive_folder_id, drive_para_nuevas')
      .eq('id', profile.tenant_id).single()
      .then(({ data }) => {
        setLogoUrl(data?.logo_url ?? null)
        setDriveConectado(!!data?.google_refresh_token)
        setDriveFolderGuardado(data?.drive_folder_id ?? null)
        setDriveFolderInput(data?.drive_folder_id ?? '')
        setDriveParaNuevas(data?.drive_para_nuevas !== false)
      })
    // Config cotizaciones S.T. (defensiva — columnas pueden no existir si v68 no corrió)
    supabase.from('tenants')
      .select('servtec_telefono1, servtec_telefono2, servtec_email, servtec_mensaje_cotizacion')
      .eq('id', profile.tenant_id).single()
      .then(({ data }) => {
        if (!data) return
        setServtecTel1(data.servtec_telefono1 ?? '')
        setServtecTel2(data.servtec_telefono2 ?? '')
        setServtecEmail(data.servtec_email ?? '')
        setServtecMsg(data.servtec_mensaje_cotizacion ?? '')
      })
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

  const guardarDriveFolder = async () => {
    if (!profile?.tenant_id) return
    setSavingDriveFolder(true)
    setDriveMsg(null)
    try {
      const raw = driveFolderInput.trim()
      const folderId = raw.includes('/')
        ? (raw.split('/folders/')[1]?.split('?')[0] ?? raw)
        : raw
      await supabase.from('tenants').update({ drive_folder_id: folderId || null }).eq('id', profile.tenant_id)
      setDriveFolderGuardado(folderId || null)
      setDriveFolderInput(folderId)
      setDriveMsg({ ok: true, text: 'Carpeta guardada correctamente.' })
    } catch {
      setDriveMsg({ ok: false, text: 'No se pudo guardar la carpeta.' })
    } finally {
      setSavingDriveFolder(false)
    }
  }

  const desconectarDrive = async () => {
    if (!profile?.tenant_id || !confirm('¿Desconectar Google Drive? Las fotos nuevas volverán a guardarse en R2.')) return
    setDisconnectingDrive(true)
    setDriveMsg(null)
    try {
      await fetch('/api/drive/disconnect', { method: 'POST' })
      setDriveConectado(false)
      setDriveMsg({ ok: true, text: 'Google Drive desconectado.' })
    } catch {
      setDriveMsg({ ok: false, text: 'No se pudo desconectar.' })
    } finally {
      setDisconnectingDrive(false)
    }
  }

  const cargarConteosDrive = async () => {
    const res = await fetch(`/api/admin/migrar-a-drive?tenant_id=${profile?.tenant_id ?? ''}`)
    if (res.ok) {
      const json = await res.json()
      setMigDriveR2(json.enR2 ?? 0)
      setMigDriveEnDrive(json.enDrive ?? 0)
      setDriveMsg({
        ok: true,
        text: `Debug: tenantId usado=${json._debugTenantId} | perfil.tenant_id=${json._debugPerfilTenantId} | query param=${json._debugQueryParam}`,
      })
    } else {
      const texto = await res.text().catch(() => '')
      setDriveMsg({ ok: false, text: `No se pudo consultar (HTTP ${res.status}): ${texto}` })
    }
  }

  const migrarADrive = async () => {
    if (migDrive) return
    setMigDrive(true)
    setMigDriveErrores([])
    setMigDriveProcesados(0)
    let restantes = migDriveR2 ?? 1
    while (restantes > 0) {
      const res = await fetch(`/api/admin/migrar-a-drive?tenant_id=${profile?.tenant_id ?? ''}`, { method: 'POST' })
      if (!res.ok) {
        const texto = await res.text().catch(() => '')
        setDriveMsg({ ok: false, text: `Error (HTTP ${res.status}): ${texto}` })
        break
      }
      const json = await res.json()
      setMigDriveProcesados((p) => p + (json.procesados ?? 0))
      setMigDriveEnDrive(json.enDrive ?? 0)
      setMigDriveR2(json.restantes ?? 0)
      if (json.errores?.length) setMigDriveErrores((e) => [...e, ...json.errores])
      restantes = json.restantes ?? 0
      if (json.procesados === 0 && restantes > 0) break  // atascado
    }
    setMigDrive(false)
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

      {/* ─── Google Drive ──────────────────────────────────── */}
      {(() => {
        const driveOk = searchParams.get('drive_ok')
        const driveError = searchParams.get('drive_error')
        const driveListoParaUsarse = driveConectado && !!driveFolderGuardado
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Almacenamiento en Google Drive</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Las fotos de las órdenes se guardarán en carpetas por placa dentro de tu Drive.
                  Los videos siguen en R2.
                </p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                driveListoParaUsarse
                  ? 'bg-green-100 text-green-700 border-green-200'
                  : driveConectado
                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200'
              }`}>
                {driveListoParaUsarse ? '✓ Activo' : driveConectado ? 'Falta carpeta' : 'Sin conectar'}
              </span>
            </div>

            {(driveOk || driveError) && (
              <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm border ${
                driveOk ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
              }`}>
                <span className="flex-shrink-0 mt-0.5">{driveOk ? '✓' : '✗'}</span>
                <span>{driveOk ? 'Google Drive conectado correctamente.' : `Error al conectar: ${driveError}`}</span>
              </div>
            )}

            {driveMsg && (
              <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm border ${
                driveMsg.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
              }`}>
                <span className="flex-shrink-0 mt-0.5">{driveMsg.ok ? '✓' : '✗'}</span>
                <span>{driveMsg.text}</span>
              </div>
            )}

            {/* Paso 1: Conectar cuenta */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                Paso 1 — Conectar cuenta de Google
              </p>
              {driveConectado ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-green-700 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Cuenta de Google conectada
                  </span>
                  <button
                    onClick={desconectarDrive}
                    disabled={disconnectingDrive}
                    className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                  >
                    {disconnectingDrive ? 'Desconectando...' : 'Desconectar'}
                  </button>
                </div>
              ) : (
                <a
                  href={`/api/drive/connect`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 hover:border-blue-400 hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Conectar con Google Drive
                </a>
              )}
            </div>

            {/* Paso 2: Carpeta de Drive */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                Paso 2 — Pegar el link de la carpeta de Drive
              </p>
              <p className="text-xs text-gray-500">
                Crea una carpeta en tu Drive (ej. &quot;Fotos OptiDesk&quot;) → ábrela → copia la URL completa del navegador y pégala aquí. El sistema creará sub-carpetas automáticas por placa dentro de ella.
              </p>
              <div className="flex gap-2">
                <input
                  value={driveFolderInput}
                  onChange={(e) => setDriveFolderInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/1ABC... o solo el ID"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={guardarDriveFolder}
                  disabled={savingDriveFolder || !driveFolderInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  {savingDriveFolder ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
              {driveFolderGuardado && (
                <p className="text-xs text-green-700 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                  </svg>
                  Carpeta configurada: <span className="font-mono">{driveFolderGuardado}</span>
                </p>
              )}
            </div>

            {/* Toggle: activar/desactivar Drive para fotos nuevas */}
            {driveListoParaUsarse && (
              <div className="flex items-center justify-between py-3 border-t border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-700">Guardar nuevas fotos en Drive</p>
                  <p className="text-xs text-gray-500">Las fotos de las órdenes irán a Drive en vez de R2.</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const next = !driveParaNuevas
                    setDriveParaNuevas(next)
                    await supabase.from('tenants').update({ drive_para_nuevas: next }).eq('id', profile!.tenant_id)
                  }}
                  className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${driveParaNuevas ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${driveParaNuevas ? 'translate-x-6' : ''}`} />
                </button>
              </div>
            )}

            {/* Paso 3: Migrar fotos y videos viejos de R2 a Drive */}
            {driveListoParaUsarse && (
              <div className="space-y-3 border-t border-gray-100 pt-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">Paso 3 — Mover fotos y videos anteriores a Drive</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Mueve todo lo que ya estaba guardado en R2 a tu carpeta de Drive, organizado por placa.
                    Los videos se comprimen automáticamente a menos de 10 MB. Los archivos en R2 se conservan como copia de seguridad.
                  </p>
                </div>

                {migDriveR2 === null ? (
                  <button
                    onClick={cargarConteosDrive}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Ver cuántos archivos hay en R2
                  </button>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Pendientes en R2</span>
                      <span className="font-semibold text-amber-700">{migDriveR2}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Ya en Drive</span>
                      <span className="font-semibold text-green-700">{migDriveEnDrive}</span>
                    </div>
                    {migDriveProcesados > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Movidos en esta sesión</span>
                        <span className="font-semibold">{migDriveProcesados}</span>
                      </div>
                    )}
                  </div>
                )}

                {migDriveR2 !== null && migDriveR2 > 0 && (
                  <button
                    onClick={migrarADrive}
                    disabled={migDrive}
                    className="flex items-center gap-2 px-5 py-3 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    {migDrive ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Migrando... ({migDriveProcesados} listos, {migDriveR2} pendientes)
                      </>
                    ) : (
                      `Mover ${migDriveR2} archivo${migDriveR2 !== 1 ? 's' : ''} a Drive`
                    )}
                  </button>
                )}

                {migDriveR2 !== null && migDriveR2 === 0 && !migDrive && (
                  <p className="text-sm text-green-700 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Todo migrado a Drive ({migDriveEnDrive} archivo{migDriveEnDrive !== 1 ? 's' : ''}).
                  </p>
                )}

                {migDriveErrores.length > 0 && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-0.5">
                    <p className="font-semibold">{migDriveErrores.length} error(es) — se continuó con el resto:</p>
                    {migDriveErrores.slice(0, 5).map((e, i) => (
                      <p key={i}>{e.nombre}: {e.error}</p>
                    ))}
                  </div>
                )}

                <p className="text-xs text-gray-400">
                  Puede tardar varios minutos si hay muchos archivos o videos grandes. No cierres la página mientras dice &quot;Migrando...&quot;.
                </p>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── COTIZACIONES S.T. — Contacto y mensaje ── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📄</span>
            <h2 className="text-base font-bold text-gray-900">Cotizaciones S.T. — Pie de página y mensaje</h2>
          </div>
        </div>
        <div className="p-5 space-y-3 max-w-lg">
          <p className="text-xs text-gray-400">Estos datos aparecen en el pie de cada página del PDF de cotización de Servicio Técnico.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Teléfono 1</label>
              <input value={servtecTel1} onChange={e => setServtecTel1(e.target.value)} placeholder="ej: 3001234567"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Teléfono 2 (opcional)</label>
              <input value={servtecTel2} onChange={e => setServtecTel2(e.target.value)} placeholder="ej: 6011234567"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Correo electrónico</label>
            <input value={servtecEmail} onChange={e => setServtecEmail(e.target.value)} placeholder="ej: servicio@taller.com" type="email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Mensaje de cierre de cotización</label>
            <textarea value={servtecMsg} onChange={e => setServtecMsg(e.target.value)} rows={3}
              placeholder="Texto que aparece al final de la cotización..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (!profile?.tenant_id) return
                setSavingServtec(true); setServtecOk(false)
                await supabase.from('tenants').update({
                  servtec_telefono1: servtecTel1 || null,
                  servtec_telefono2: servtecTel2 || null,
                  servtec_email: servtecEmail || null,
                  servtec_mensaje_cotizacion: servtecMsg || null,
                }).eq('id', profile.tenant_id)
                setSavingServtec(false); setServtecOk(true)
                setTimeout(() => setServtecOk(false), 2500)
              }}
              disabled={savingServtec}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
              {savingServtec ? 'Guardando...' : 'Guardar'}
            </button>
            {servtecOk && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
          </div>
        </div>
      </div>

      {/* ── Catálogo UMA — Editar ítems ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Catálogo UMA — Editar ítems</h2>
          <p className="text-xs text-gray-500 mt-0.5">Edita código, descripción y precio de los repuestos y lubricantes cargados. Cada cambio requiere confirmación.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {(['repuesto', 'lubricante'] as const).map(tab => (
            <button key={tab} onClick={() => { setCatalogTab(tab); setEditCatalog(null) }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${catalogTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab === 'repuesto' ? 'Repuestos' : 'Lubricantes'}
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <div className="flex gap-2">
          <input value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)}
            placeholder="Buscar por código o descripción..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {catalogSearch && (
            <button onClick={() => setCatalogSearch('')}
              className="px-3 py-2 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg text-sm">✕</button>
          )}
        </div>

        {/* Tabla */}
        {catalogLoading ? (
          <p className="text-sm text-gray-400 text-center py-6">Cargando...</p>
        ) : catalogItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin resultados.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-500 uppercase border-b bg-gray-50">
                  <th className="text-left py-2 px-3 font-medium w-32">Código</th>
                  <th className="text-left py-2 px-3 font-medium">Descripción</th>
                  <th className="text-right py-2 px-3 font-medium w-32">Precio c/IVA</th>
                  <th className="py-2 px-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {catalogItems.map(item => editCatalog?.id === item.id ? (
                  <tr key={item.id} className="border-b bg-blue-50/40">
                    <td className="py-1.5 px-2">
                      <input value={editCatalog.codigo}
                        onChange={e => setEditCatalog({ ...editCatalog, codigo: e.target.value })}
                        className="w-full px-2 py-1 border border-blue-300 rounded-lg text-xs font-mono focus:outline-none" />
                    </td>
                    <td className="py-1.5 px-2">
                      <input value={editCatalog.descripcion}
                        onChange={e => setEditCatalog({ ...editCatalog, descripcion: e.target.value })}
                        autoFocus
                        className="w-full px-2 py-1 border border-blue-300 rounded-lg text-sm focus:outline-none" />
                    </td>
                    <td className="py-1.5 px-2">
                      <input value={editCatalog.precio}
                        onChange={e => setEditCatalog({ ...editCatalog, precio: e.target.value.replace(/\D/g, '') })}
                        className="w-full px-2 py-1 border border-blue-300 rounded-lg text-sm font-mono text-right focus:outline-none"
                        inputMode="numeric" />
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => {
                          if (!editCatalog.codigo.trim() || !editCatalog.descripcion.trim()) return
                          setConfirmCatalog({
                            id: item.id,
                            original: { codigo: item.codigo, descripcion: item.descripcion, precio: item.precio_publico_iva },
                            nuevo: { codigo: editCatalog.codigo, descripcion: editCatalog.descripcion, precio: editCatalog.precio },
                          })
                        }} className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-semibold">OK</button>
                        <button onClick={() => setEditCatalog(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">✕</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono text-xs text-gray-600">{item.codigo}</td>
                    <td className="py-2 px-3 text-gray-800 truncate max-w-xs" title={item.descripcion}>{item.descripcion}</td>
                    <td className="py-2 px-3 text-right text-gray-700 font-semibold">
                      {item.precio_publico_iva != null ? `$${item.precio_publico_iva.toLocaleString('es-CO')}` : '—'}
                    </td>
                    <td className="py-2 px-3">
                      <button onClick={() => setEditCatalog({ id: item.id, codigo: item.codigo, descripcion: item.descripcion, precio: String(item.precio_publico_iva ?? '') })}
                        className="text-gray-400 hover:text-blue-600 p-1 transition-colors" title="Editar">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {catalogItems.length === 300 && (
              <p className="text-xs text-gray-400 text-center py-2">Mostrando primeros 300 resultados — usa el buscador para filtrar.</p>
            )}
          </div>
        )}
      </div>

      {/* Modal de confirmación catálogo */}
      {confirmCatalog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Confirmar cambios en catálogo</h3>
            <p className="text-sm text-gray-500">Revisa los cambios antes de guardar. Esta acción actualiza el catálogo UMA.</p>
            <div className="rounded-xl border border-gray-100 overflow-hidden text-sm">
              <table className="w-full">
                <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="text-left py-2 px-3 font-medium">Campo</th>
                  <th className="text-left py-2 px-3 font-medium">Antes</th>
                  <th className="text-left py-2 px-3 font-medium">Después</th>
                </tr></thead>
                <tbody>
                  {confirmCatalog.original.codigo !== confirmCatalog.nuevo.codigo && (
                    <tr className="border-t">
                      <td className="py-2 px-3 text-gray-500 font-medium">Código</td>
                      <td className="py-2 px-3 font-mono text-red-600 line-through">{confirmCatalog.original.codigo}</td>
                      <td className="py-2 px-3 font-mono text-green-700 font-semibold">{confirmCatalog.nuevo.codigo}</td>
                    </tr>
                  )}
                  {confirmCatalog.original.descripcion !== confirmCatalog.nuevo.descripcion && (
                    <tr className="border-t">
                      <td className="py-2 px-3 text-gray-500 font-medium">Descripción</td>
                      <td className="py-2 px-3 text-red-600 line-through">{confirmCatalog.original.descripcion}</td>
                      <td className="py-2 px-3 text-green-700 font-semibold">{confirmCatalog.nuevo.descripcion}</td>
                    </tr>
                  )}
                  {String(confirmCatalog.original.precio ?? '') !== confirmCatalog.nuevo.precio && (
                    <tr className="border-t">
                      <td className="py-2 px-3 text-gray-500 font-medium">Precio c/IVA</td>
                      <td className="py-2 px-3 text-red-600 line-through">{confirmCatalog.original.precio != null ? `$${confirmCatalog.original.precio.toLocaleString('es-CO')}` : '—'}</td>
                      <td className="py-2 px-3 text-green-700 font-semibold">{confirmCatalog.nuevo.precio ? `$${parseInt(confirmCatalog.nuevo.precio).toLocaleString('es-CO')}` : '—'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button onClick={() => setConfirmCatalog(null)} disabled={savingCatalog}
                className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={guardarCatalogItem} disabled={savingCatalog}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                {savingCatalog ? 'Guardando...' : 'Confirmar y guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default function ConfigServicioPage() {
  return (
    <Suspense>
      <ConfigServicioContent />
    </Suspense>
  )
}
