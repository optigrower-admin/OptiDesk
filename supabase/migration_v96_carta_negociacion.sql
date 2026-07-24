-- Migration v96: Número de carta de negociación en clientes
-- Se solicita cuando el cliente entra a la etapa "Vendida/Carta Negociación" (ganado).
-- Solo acepta dígitos numéricos; se guarda como texto para preservar ceros iniciales.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS numero_carta_negociacion TEXT;
