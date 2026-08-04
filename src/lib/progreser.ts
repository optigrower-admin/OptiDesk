// ══════════════════════════════════════════════════════════════════════════════
// Automatización del formulario de "Aprobación de Cupo - Motocicleta" en
// Progreser (sipresplus-cloud.progreser.com). Controla un navegador real
// (Chromium sin interfaz) para iniciar sesión y llenar los datos básicos del
// cliente — el resto del formulario (demográficos, referencias, garantías,
// etc.) lo completa el asesor a mano, porque esa información no vive en
// OptiDesk.
//
// Es intencionalmente instrumentado con capturas de pantalla en cada paso:
// como no hay forma de probar contra el sitio real de Progreser desde este
// entorno, si algo falla (porque Progreser cambió su formulario, por
// ejemplo) la captura del momento exacto del fallo es la única forma de
// diagnosticar y corregir los selectores sin adivinar.
// ══════════════════════════════════════════════════════════════════════════════
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

const LOGIN_URL = 'https://sipresplus-cloud.progreser.com/login'
const FORM_URL = 'https://sipresplus-cloud.progreser.com/aprobacion-cupo/motocicleta'

export interface DatosClienteProgreser {
  tipoDocumento: string  // 'CC' | 'CE' | 'TI' | etc — ver TIPO_DOC_LABEL
  numeroDocumento: string
  primerNombre: string
  segundoNombre?: string
  primerApellido: string
  segundoApellido?: string
  correo: string
  celular: string
}

export interface ResultadoProgreser {
  ok: boolean
  mensaje: string
  screenshots: { paso: string; buffer: Buffer }[]
}

const TIPO_DOC_LABEL: Record<string, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  TI: 'Tarjeta de identidad',
  PASAPORTE: 'Pasaporte',
  NIT: 'NIT',
  RC: 'Registro civil',
  PEP: 'Permiso especial de permanencia',
}

async function getBrowser(): Promise<Browser> {
  const executablePath = await chromium.executablePath()
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1366, height: 900 },
    executablePath,
    headless: true,
  })
}

/** Busca un <input> visible cerca de un <label>/texto dado (por contenido de
 * texto, no por clase CSS) — mucho más resistente a que Progreser cambie
 * nombres de clase que un selector CSS fijo. */
async function fillByLabelText(page: Page, labelText: string, value: string): Promise<boolean> {
  const filled = await page.evaluate((label: string, val: string) => {
    const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const objetivo = normalizar(label)
    const candidatos = Array.from(document.querySelectorAll('label, span, div'))
      .filter(el => normalizar(el.textContent ?? '').startsWith(objetivo) && (el.textContent ?? '').length < objetivo.length + 5)

    for (const cand of candidatos) {
      // Busca el input más cercano: dentro del mismo contenedor (mat-form-field-ish) o siguiente hermano
      const contenedor = cand.closest('div, mat-form-field, form') ?? cand.parentElement
      const input = (contenedor?.querySelector('input, textarea') as HTMLInputElement | null)
        ?? (cand.parentElement?.querySelector('input, textarea') as HTMLInputElement | null)
      if (input) {
        input.focus()
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, val)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        input.blur()
        return true
      }
    }
    return false
  }, labelText, value)
  return filled
}

async function screenshot(page: Page, paso: string, out: ResultadoProgreser['screenshots']) {
  try {
    const buffer = await page.screenshot({ fullPage: true, type: 'png' }) as Buffer
    out.push({ paso, buffer })
  } catch { /* si ni la captura funciona, seguimos sin bloquear */ }
}

export async function enviarClienteAProgreser(
  usuario: string,
  password: string,
  cliente: DatosClienteProgreser,
): Promise<ResultadoProgreser> {
  const screenshots: ResultadoProgreser['screenshots'] = []
  let browser: Browser | null = null

  try {
    browser = await getBrowser()
    const page = await browser.newPage()
    page.setDefaultTimeout(30_000)

    // ── 1. Login ──────────────────────────────────────────────────────────
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' })
    await screenshot(page, '1-login-cargado', screenshots)

    const userInput = await page.waitForSelector('input[type="text"], input[type="email"], input[name*="user" i]', { timeout: 15_000 }).catch(() => null)
    const passInput = await page.$('input[type="password"]')
    if (!userInput || !passInput) {
      await screenshot(page, '1-login-sin-campos', screenshots)
      return { ok: false, mensaje: 'No se encontraron los campos de usuario/contraseña en la página de login de Progreser — puede que hayan cambiado el diseño del sitio.', screenshots }
    }
    await userInput.type(usuario, { delay: 20 })
    await passInput.type(password, { delay: 20 })
    await screenshot(page, '2-login-lleno', screenshots)

    const boton = await page.$('button[type="submit"]') ?? await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      return btns.find(b => /ingres|iniciar|entrar|login/i.test(b.textContent ?? '')) ?? null
    })
    if (boton && 'click' in boton) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => null),
        (boton as { click: () => Promise<void> }).click(),
      ])
    }
    await screenshot(page, '3-post-login', screenshots)

    if (page.url().includes('/login')) {
      return { ok: false, mensaje: 'El login a Progreser no avanzó — revisa que el usuario/contraseña guardados sean correctos.', screenshots }
    }

    // ── 2. Ir al formulario de aprobación de cupo — motocicleta ──────────────
    await page.goto(FORM_URL, { waitUntil: 'networkidle2' })
    await screenshot(page, '4-formulario-cargado', screenshots)

    // ── 3. Llenar "Datos básicos" del cliente ────────────────────────────────
    const tipoDocLabel = TIPO_DOC_LABEL[cliente.tipoDocumento] ?? cliente.tipoDocumento
    // El tipo de documento suele ser un <select>/<mat-select> — se intenta como select nativo primero.
    await page.evaluate((label: string) => {
      const selects = Array.from(document.querySelectorAll('select'))
      for (const sel of selects) {
        const opt = Array.from(sel.options).find(o => o.textContent?.trim() === label)
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true }
      }
      return false
    }, tipoDocLabel).catch(() => {})

    const campos: [string, string | undefined][] = [
      ['Número de Identificación', cliente.numeroDocumento],
      ['Primer Apellido', cliente.primerApellido],
      ['Segundo Apellido', cliente.segundoApellido],
      ['Primer Nombre', cliente.primerNombre],
      ['Segundo Nombre', cliente.segundoNombre],
      ['Correo Electrónico', cliente.correo],
      ['Celular', cliente.celular],
    ]

    const faltantes: string[] = []
    for (const [label, valor] of campos) {
      if (!valor) continue
      const ok = await fillByLabelText(page, label, valor)
      if (!ok) faltantes.push(label)
    }
    await screenshot(page, '5-datos-basicos-llenos', screenshots)

    if (faltantes.length) {
      return {
        ok: false,
        mensaje: `Se llenaron los campos que se pudieron encontrar, pero no se encontró en el formulario: ${faltantes.join(', ')}. Revisa la captura y completa esos manualmente.`,
        screenshots,
      }
    }

    // ── 4. Avanzar al siguiente paso (para que Progreser guarde lo llenado) ──
    // Sin este clic, muchos formularios por pasos no persisten nada — el
    // asesor entraría después y encontraría todo en blanco otra vez.
    const avanzo = await page.evaluate(() => {
      const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
      const botones = Array.from(document.querySelectorAll('button'))
      const boton = botones.find(b => /siguiente|continuar|guardar/.test(normalizar(b.textContent ?? '')) && !(b as HTMLButtonElement).disabled)
      if (boton) { (boton as HTMLButtonElement).click(); return true }
      return false
    })
    if (avanzo) {
      await new Promise(res => setTimeout(res, 2500))
    }
    await screenshot(page, '6-despues-de-avanzar', screenshots)

    return {
      ok: true,
      mensaje: avanzo
        ? 'Datos básicos llenados y guardados en Progreser (se avanzó al siguiente paso). Entra a Progreser con tu usuario para completar el resto del formulario (Datos Demográficos, Condiciones de Cupo, etc.) — esa información no vive en OptiDesk.'
        : 'Datos básicos llenados, pero no se encontró el botón para avanzar/guardar — revisa la última captura y dale clic ahí mismo en Progreser antes de que se pierda lo llenado.',
      screenshots,
    }
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'Error desconocido controlando el navegador', screenshots }
  } finally {
    await browser?.close().catch(() => {})
  }
}
