-- v108: Métodos de pago por contacto interno
--
-- Cada contacto puede tener cero, uno o varios métodos de pago (cuenta
-- bancaria, Nequi, Daviplata, Llave...), cada uno con sus propios datos —
-- por eso se guarda como JSONB en vez de columnas fijas: no todos los
-- contactos usan los mismos métodos ni la misma cantidad.
--
-- Forma de cada elemento del array:
--   { "tipo": "Cuenta bancaria" | "Nequi" | "Daviplata" | "Llave" | otro texto,
--     "banco": string | null,   -- solo aplica a "Cuenta bancaria"
--     "numero": string }        -- número de cuenta / celular / valor de la llave

ALTER TABLE contactos_internos ADD COLUMN IF NOT EXISTS metodos_pago JSONB NOT NULL DEFAULT '[]';
