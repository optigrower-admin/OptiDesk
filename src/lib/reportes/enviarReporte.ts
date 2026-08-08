import type { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailComoEmpresa } from '@/lib/email'
import { getCfgMeta, enviarWADirecto, enviarWAImagenDirecta } from '@/lib/mensajeria/enviar-wa-directo'
import { calcularPeriodoReporte, type PeriodoReporte } from './periodo'
import { obtenerSeccionesPipeline, construirPipelineHtml, construirPipelineWhatsapp } from './resumenPipeline'
import { obtenerSeccionesServicioTecnico, construirServicioTecnicoHtml, construirServicioTecnicoWhatsapp } from './resumenServicioTecnico'

type Supa = ReturnType<typeof createAdminClient>

export interface ReporteProgramadoRow {
  id: string
  tenant_id: string
  usuario_id: string
  tipo_reporte: 'pipeline' | 'servicio_tecnico'
  asunto: string
  canal_correo: boolean
  canal_whatsapp: boolean
  periodo: PeriodoReporte
  modo_gerencia: 'general' | 'por_usuario'
}

export async function generarYEnviarReporte(supabase: Supa, config: ReporteProgramadoRow): Promise<{ ok: boolean; error?: string }> {
  const { data: usuario } = await supabase.from('usuarios')
    .select('id, nombre, rol, email, whatsapp_number, reportes_ve_todo_pipeline, reportes_ve_todo_st').eq('id', config.usuario_id).maybeSingle()
  if (!usuario) return { ok: false, error: 'Usuario no encontrado' }

  const { desdeISO, hastaISO } = calcularPeriodoReporte(config.periodo)
  const nombreUsuario = usuario.nombre ?? 'colaborador'
  const reportesVeTodo = config.tipo_reporte === 'pipeline' ? usuario.reportes_ve_todo_pipeline : usuario.reportes_ve_todo_st
  const perfilUsuario = { id: usuario.id, nombre: nombreUsuario, rol: usuario.rol, reportesVeTodo }

  let html: string
  let enviarWhatsappSecciones: () => Promise<boolean>

  if (config.tipo_reporte === 'pipeline') {
    const secciones = await obtenerSeccionesPipeline(supabase, config.tenant_id, perfilUsuario, config.modo_gerencia)
    html = construirPipelineHtml(secciones, nombreUsuario)
    enviarWhatsappSecciones = async () => {
      const cfg = await getCfgMeta(supabase, config.tenant_id)
      if (!cfg || !usuario.whatsapp_number) return false
      let algunOk = false
      for (const seccion of secciones) {
        const { imagen, caption, textoDetalle } = await construirPipelineWhatsapp(seccion)
        const ok = await enviarWAImagenDirecta(cfg, usuario.whatsapp_number, imagen, caption)
        if (ok) { algunOk = true; if (textoDetalle) await enviarWADirecto(cfg, usuario.whatsapp_number, textoDetalle) }
      }
      return algunOk
    }
  } else {
    const secciones = await obtenerSeccionesServicioTecnico(supabase, config.tenant_id, perfilUsuario, desdeISO, hastaISO, config.modo_gerencia)
    html = construirServicioTecnicoHtml(secciones, config.periodo, nombreUsuario)
    enviarWhatsappSecciones = async () => {
      const cfg = await getCfgMeta(supabase, config.tenant_id)
      if (!cfg || !usuario.whatsapp_number) return false
      let algunOk = false
      for (const seccion of secciones) {
        const { imagen, caption, textoDetalle } = await construirServicioTecnicoWhatsapp(seccion, config.periodo)
        const ok = await enviarWAImagenDirecta(cfg, usuario.whatsapp_number, imagen, caption)
        if (ok) { algunOk = true; if (textoDetalle) await enviarWADirecto(cfg, usuario.whatsapp_number, textoDetalle) }
      }
      return algunOk
    }
  }

  let enviadoAlgo = false
  const errores: string[] = []

  if (config.canal_correo) {
    if (!usuario.email) {
      errores.push('Sin correo de notificación configurado')
    } else {
      try {
        await sendEmailComoEmpresa(config.tenant_id, usuario.email, config.asunto, html)
        enviadoAlgo = true
      } catch (e) {
        errores.push(e instanceof Error ? e.message : 'Error al enviar el correo')
      }
    }
  }

  if (config.canal_whatsapp) {
    if (!usuario.whatsapp_number) {
      errores.push('Sin WhatsApp configurado')
    } else {
      try {
        const ok = await enviarWhatsappSecciones()
        if (ok) enviadoAlgo = true
        else errores.push('No se pudo enviar por WhatsApp (revisa la conexión de WhatsApp de la empresa)')
      } catch (e) {
        errores.push(e instanceof Error ? e.message : 'Error al enviar por WhatsApp')
      }
    }
  }

  if (!enviadoAlgo) return { ok: false, error: errores.join('; ') || 'No se pudo enviar por ningún canal' }
  return { ok: true, error: errores.length ? errores.join('; ') : undefined }
}
