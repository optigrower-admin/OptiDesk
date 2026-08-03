-- v134: El disparador "Mensaje nuevo de un contacto" ahora puede filtrar por
-- canal (WhatsApp / Messenger / Instagram / Manual / Todos) en vez de
-- disparar siempre sin importar de dónde vino el mensaje.

ALTER TABLE flujos_automatizacion ADD COLUMN IF NOT EXISTS canal_trigger TEXT NOT NULL DEFAULT 'todos';
