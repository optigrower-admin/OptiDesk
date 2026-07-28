-- ============================================================
-- V86: Comentarios internos por orden de servicio
-- ============================================================

CREATE TABLE IF NOT EXISTS public.comentarios_orden (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id    UUID        NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  comentario  TEXT        NOT NULL,
  usuario_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_orden_orden   ON public.comentarios_orden(orden_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_orden_tenant  ON public.comentarios_orden(tenant_id);

ALTER TABLE public.comentarios_orden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_comentarios_orden"
  ON public.comentarios_orden FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

GRANT ALL ON TABLE public.comentarios_orden TO postgres, anon, authenticated, service_role;
