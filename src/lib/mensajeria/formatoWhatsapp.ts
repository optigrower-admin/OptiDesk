// Los modelos de IA por defecto escriben negrita en markdown de doble
// asterisco (**texto**), pero WhatsApp solo interpreta un asterisco simple
// (*texto*) — sin esto, el cliente ve los asteriscos dobles literales.
export function sanitizarFormatoWhatsapp(texto: string): string {
  return texto.replace(/\*\*(.+?)\*\*/g, '*$1*')
}

// Separador que un agente configurado para "responder en varios mensajes"
// incluye en su respuesta para marcar dónde termina un mensaje y empieza el
// siguiente — se envían como mensajes de WhatsApp separados, en vez de uno
// solo con saltos de línea, para sonar más natural (como escribiría una
// persona real).
export const SEPARADOR_MULTIMENSAJE = '§§§'

export function dividirEnMensajes(texto: string): string[] {
  return texto
    .split(SEPARADOR_MULTIMENSAJE)
    .map(t => t.trim())
    .filter(Boolean)
}
