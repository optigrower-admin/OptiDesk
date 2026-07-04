-- v68: Configuración de cotizaciones para Servicio Técnico
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS servtec_telefono1          text,
  ADD COLUMN IF NOT EXISTS servtec_telefono2          text,
  ADD COLUMN IF NOT EXISTS servtec_email              text,
  ADD COLUMN IF NOT EXISTS servtec_mensaje_cotizacion text
    DEFAULT 'Esta cotización tiene una validez de 30 días a partir de la fecha de emisión. Los precios son de referencia y pueden variar según disponibilidad. Para confirmar su pedido o solicitar más información, no dude en contactarnos. ¡Gracias por confiar en nuestro servicio técnico!';
