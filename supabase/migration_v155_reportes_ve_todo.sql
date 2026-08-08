-- v155: permite que un usuario con rol 'admin' vea el equipo completo en
-- sus reportes programados (📊 pipeline / 🔧 Servicio Técnico), igual que
-- gerencia/dueño/control_total, si se marca esta opción para él en Bot
-- Colaboradores. Por defecto false: un admin sigue viendo solo lo suyo.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS reportes_ve_todo BOOLEAN NOT NULL DEFAULT false;
