-- ============================================================
-- MIGRACIÓN v47 — Método de pago en Gastos de Caja
--
-- Permite registrar con qué cuenta/método se pagó cada gasto de
-- caja, igual que ya se hace con los pagos de Servicio Técnico.
-- Necesario para el desglose "por cuenta" en el panel de Caja.
-- ============================================================

ALTER TABLE gastos_caja ADD COLUMN IF NOT EXISTS metodo_pago_id UUID REFERENCES metodos_pago(id);

-- ============================================================
-- FIN MIGRACIÓN v47
-- ============================================================
