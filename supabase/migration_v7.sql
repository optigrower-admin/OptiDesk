-- migration_v7.sql
-- Índices GIN trigram para búsqueda ilike eficiente en repuestos_uma
-- Ejecutar en Supabase SQL Editor

-- Habilitar extensión pg_trgm si no está activa
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices para búsqueda full-text ilike en los tres campos de búsqueda
CREATE INDEX IF NOT EXISTS idx_repuestos_uma_codigo_trgm
  ON repuestos_uma USING GIN (codigo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_repuestos_uma_descripcion_trgm
  ON repuestos_uma USING GIN (descripcion gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_repuestos_uma_subgrupo_trgm
  ON repuestos_uma USING GIN (subgrupo gin_trgm_ops);

-- Índice compuesto tenant + activo (mejora el WHERE previo a los filtros)
CREATE INDEX IF NOT EXISTS idx_repuestos_uma_tenant_activo
  ON repuestos_uma(tenant_id, activo);
