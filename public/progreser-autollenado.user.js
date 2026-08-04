// ==UserScript==
// @name         OptiDesk → Autollenado Progreser
// @namespace    optidesk
// @version      1.0
// @description  Llena los Datos Básicos del formulario de Progreser con los datos del cliente traídos desde OptiDesk
// @match        https://sipresplus-cloud.progreser.com/aprobacion-cupo/motocicleta*
// @grant        none
// ==/UserScript==

(function () {
  'use strict'

  const params = new URLSearchParams(window.location.search)
  const token = params.get('optidesk')
  if (!token) return

  const TIPO_DOC_LABEL = {
    CC: 'Cédula de ciudadanía', CE: 'Cédula de extranjería', TI: 'Tarjeta de identidad',
    PASAPORTE: 'Pasaporte', NIT: 'NIT', RC: 'Registro civil', PEP: 'Permiso especial de permanencia',
  }

  function normalizar(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  }

  function fillByLabelText(labelText, value) {
    if (!value) return false
    const objetivo = normalizar(labelText)
    const candidatos = Array.from(document.querySelectorAll('label, span, div'))
      .filter(el => normalizar(el.textContent).startsWith(objetivo) && (el.textContent || '').length < objetivo.length + 5)
    for (const cand of candidatos) {
      const contenedor = cand.closest('div, mat-form-field, form') || cand.parentElement
      const input = (contenedor && contenedor.querySelector('input, textarea')) || (cand.parentElement && cand.parentElement.querySelector('input, textarea'))
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        input.focus()
        setter.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        input.blur()
        return true
      }
    }
    return false
  }

  function fillTipoDocumento(label) {
    const selects = Array.from(document.querySelectorAll('select'))
    for (const sel of selects) {
      const opt = Array.from(sel.options).find(o => (o.textContent || '').trim() === label)
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true }
    }
    return false
  }

  function mostrarAviso(texto, ok) {
    const aviso = document.createElement('div')
    aviso.textContent = texto
    aviso.style.cssText = `position:fixed;bottom:80px;right:20px;z-index:99999;max-width:320px;background:${ok ? '#059669' : '#dc2626'};color:#fff;padding:10px 14px;border-radius:8px;font:13px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);`
    document.body.appendChild(aviso)
    setTimeout(() => aviso.remove(), 7000)
  }

  async function llenar() {
    let resp
    try {
      resp = await fetch(`https://opti-desk.vercel.app/api/v1/progreser/datos?token=${encodeURIComponent(token)}`)
    } catch {
      mostrarAviso('No se pudo conectar con OptiDesk para traer los datos del cliente.', false)
      return
    }
    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data) {
      mostrarAviso(data && data.error ? data.error : 'Error al traer los datos del cliente desde OptiDesk.', false)
      return
    }

    fillTipoDocumento(TIPO_DOC_LABEL[data.tipoDocumento] || data.tipoDocumento)
    const faltantes = []
    const campos = [
      ['Número de Identificación', data.numeroDocumento],
      ['Primer Apellido', data.primerApellido],
      ['Segundo Apellido', data.segundoApellido],
      ['Primer Nombre', data.primerNombre],
      ['Segundo Nombre', data.segundoNombre],
      ['Correo Electrónico', data.correo],
      ['Celular', data.celular],
    ]
    for (const [label, valor] of campos) {
      if (!valor) continue
      if (!fillByLabelText(label, valor)) faltantes.push(label)
    }

    mostrarAviso(
      faltantes.length ? `Se llenaron los campos encontrados. No se encontró: ${faltantes.join(', ')}.` : '✅ Datos básicos llenados desde OptiDesk.',
      faltantes.length === 0
    )
  }

  const btn = document.createElement('button')
  btn.textContent = '⚡ Llenar con OptiDesk'
  btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;background:#2563eb;color:#fff;padding:12px 18px;border:none;border-radius:10px;font:bold 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);'
  btn.onclick = llenar
  document.body.appendChild(btn)
})()
