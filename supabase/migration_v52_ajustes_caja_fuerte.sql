-- ============================================================
-- MIGRACIÓN v52 — Ajustes de caja también pueden ser para "Caja fuerte"
--
-- "Caja fuerte" no es un método de pago real del catálogo (nadie paga
-- con "caja fuerte"), es una cuenta independiente donde Gerencia
-- guarda parte del dinero. Hasta ahora un ajuste solo podía apuntar a
-- un método de pago real, forzando a registrar el saldo inicial de
-- caja fuerte como si fuera Efectivo. Se relaja metodo_pago_id a
-- nullable y se agrega cuenta_especial para representar este caso.
-- ============================================================

ALTER TABLE ajustes_caja ALTER COLUMN metodo_pago_id DROP NOT NULL;

ALTER TABLE ajustes_caja ADD COLUMN IF NOT EXISTS cuenta_especial TEXT CHECK (cuenta_especial IN ('caja_fuerte'));

ALTER TABLE ajustes_caja ADD CONSTRAINT ajustes_caja_cuenta_check
  CHECK (metodo_pago_id IS NOT NULL OR cuenta_especial IS NOT NULL);

-- ============================================================
-- FIN MIGRACIÓN v52
-- ============================================================
