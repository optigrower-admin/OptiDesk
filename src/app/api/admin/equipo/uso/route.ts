import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES_VEN_TODO = ['gerencia', 'dueno', 'control_total']
const SEGUNDOS_CERRADO = 45 // sin heartbeat por más de esto → se considera pestaña cerrada

function normalizarRol(rol: string) {
  return (rol ?? '').toLowerCase().replace('ñ', 'n')
}

function seccionDesdePagina(pagina: string | null): string {
  if (!pagina) return 'Desconocida'
  const partes = pagina.replace(/^\/admin\/|^\/mecanico\/?/, '').split('/').filter(Boolean)
  const mapa: Record<string, string> = {
    ordenes: 'Servicio Técnico', repuestos: 'Repuestos', inventario: 'Inventario', caja: 'Caja',
    clientes: 'Clientes', motos: 'Motos', ventas: 'Ventas', mensajes: 'Mensajes',
    comentarios: 'Comentarios/Redes', equipo: 'Mi Equipo', reportes: 'Reportes',
    'cotizaciones-servtec': 'Cotizaciones S.T.', 'config-ventas': 'Config Ventas',
    'config-servicio': 'Config Serv. Téc.', 'lista-precios': 'Lista de Motos',
    recepcion: 'Recepción (Mecánico)', '': 'Inicio',
  }
  return mapa[partes[0] ?? ''] ?? (partes[0] ? partes[0].charAt(0).toUpperCase() + partes[0].slice(1) : 'Inicio')
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = perfil.tenant_id as string
  const rolNorm = normalizarRol(perfil.rol as string)
  const veTodo = ROLES_VEN_TODO.includes(rolNorm)

  const admin = createAdminClient()

  let queryUsuarios = admin.from('usuarios').select('id, nombre, email, rol, activo').eq('tenant_id', tenantId)
  if (!veTodo) queryUsuarios = queryUsuarios.eq('id', user.id)
  const { data: usuarios } = await queryUsuarios

  const listaUsuarios = usuarios ?? []
  const ids = listaUsuarios.map(u => u.id)
  if (!ids.length) return NextResponse.json({ usuarios: [] })

  const hoy = new Date().toISOString().slice(0, 10)
  const hace7dias = new Date(Date.now() - 7 * 86400_000).toISOString()
  const hace7diasFecha = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)
  const hace30dias = new Date(Date.now() - 30 * 86400_000).toISOString()

  const [
    { data: presencias },
    { data: tiempos },
    { data: acciones },
    { data: mediosPorUsuario },
    { data: archivosPorUsuario },
    { data: navegacion },
  ] = await Promise.all([
    admin.from('usuarios_presencia').select('usuario_id, activo, pagina_actual, ultimo_heartbeat_at').in('usuario_id', ids),
    admin.from('uso_tiempo_diario').select('usuario_id, fecha, segundos_activo').in('usuario_id', ids).gte('fecha', hace7diasFecha),
    admin.from('auditoria').select('usuario_id').in('usuario_id', ids).gte('created_at', hace7dias),
    admin.from('medios').select('subido_por, tamano_bytes').in('subido_por', ids),
    admin.from('archivos_cliente').select('subido_por, tamano_bytes').in('subido_por', ids),
    admin.from('uso_navegacion').select('usuario_id, seccion').in('usuario_id', ids).gte('created_at', hace30dias),
  ])

  const ahora = Date.now()

  const resultado = listaUsuarios.map(u => {
    const presencia = presencias?.find(p => p.usuario_id === u.id)
    const segsDesdeUltimo = presencia ? (ahora - new Date(presencia.ultimo_heartbeat_at).getTime()) / 1000 : Infinity
    const estado: 'activo' | 'inactivo' | 'cerrado' =
      segsDesdeUltimo > SEGUNDOS_CERRADO ? 'cerrado' : presencia?.activo ? 'activo' : 'inactivo'

    const temposUsuario = tiempos?.filter(t => t.usuario_id === u.id) ?? []
    const tiempoHoySeg = temposUsuario.find(t => t.fecha === hoy)?.segundos_activo ?? 0
    const tiempoSemanaSeg = temposUsuario.reduce((s, t) => s + (t.segundos_activo ?? 0), 0)

    const accionesSemana = acciones?.filter(a => a.usuario_id === u.id).length ?? 0

    const bytesMedios = (mediosPorUsuario ?? []).filter(m => m.subido_por === u.id).reduce((s, m) => s + (m.tamano_bytes ?? 0), 0)
    const bytesArchivos = (archivosPorUsuario ?? []).filter(a => a.subido_por === u.id).reduce((s, a) => s + (a.tamano_bytes ?? 0), 0)

    const conteoSecciones: Record<string, number> = {}
    for (const n of navegacion ?? []) {
      if (n.usuario_id !== u.id) continue
      const s = seccionDesdePagina(n.seccion)
      conteoSecciones[s] = (conteoSecciones[s] ?? 0) + 1
    }
    const topSecciones = Object.entries(conteoSecciones).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([seccion]) => seccion)

    return {
      id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo,
      presencia: estado,
      pagina_actual: presencia?.pagina_actual ? seccionDesdePagina(presencia.pagina_actual) : null,
      ultima_conexion: presencia?.ultimo_heartbeat_at ?? null,
      tiempo_activo_hoy_seg: tiempoHoySeg,
      tiempo_activo_semana_seg: tiempoSemanaSeg,
      acciones_semana: accionesSemana,
      almacenamiento_bytes: bytesMedios + bytesArchivos,
      paginas_frecuentes: topSecciones,
    }
  })

  return NextResponse.json({ usuarios: resultado, esVistaEquipo: veTodo })
}
