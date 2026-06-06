-- ============================================================
-- OPTIDESK — Datos semilla
-- Ejecutar DESPUÉS de schema.sql en: Supabase > SQL Editor
-- ============================================================

-- 1. Tenant inicial: Motospace
INSERT INTO tenants (nombre, slug)
VALUES ('Motospace', 'motospace')
ON CONFLICT (slug) DO NOTHING;

-- 2. Secuencia de órdenes para Motospace
INSERT INTO tenant_order_sequences (tenant_id, last_number)
SELECT id, 0 FROM tenants WHERE slug = 'motospace'
ON CONFLICT (tenant_id) DO NOTHING;

-- 3. Método de pago inicial
INSERT INTO metodos_pago (tenant_id, nombre, orden)
SELECT id, 'Efectivo', 1 FROM tenants WHERE slug = 'motospace'
ON CONFLICT DO NOTHING;

-- 4. Categorías y subcategorías de servicio
-- Categoría: Venta de Repuestos UMA
INSERT INTO categorias_servicio (tenant_id, nombre, orden)
SELECT id, 'Venta de Repuestos UMA', 1
FROM tenants WHERE slug = 'motospace'
ON CONFLICT DO NOTHING;

-- Categoría: Servicio técnico UMA
INSERT INTO categorias_servicio (tenant_id, nombre, orden)
SELECT id, 'Servicio técnico UMA', 2
FROM tenants WHERE slug = 'motospace'
ON CONFLICT DO NOTHING;

-- Subcategorías para "Servicio técnico UMA"
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categorias_servicio
  WHERE nombre = 'Servicio técnico UMA'
    AND tenant_id = (SELECT id FROM tenants WHERE slug = 'motospace');

  IF cat_id IS NOT NULL THEN
    INSERT INTO subcategorias_servicio (categoria_id, nombre, orden) VALUES
      (cat_id, 'Garantías', 1),
      (cat_id, 'Cambio de aceite 1', 2),
      (cat_id, 'Cambio de aceite 2', 3),
      (cat_id, 'Cambio de aceite 3', 4),
      (cat_id, 'Particular', 5)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Categoría: Servicio técnico terceros
INSERT INTO categorias_servicio (tenant_id, nombre, orden)
SELECT id, 'Servicio técnico terceros', 3
FROM tenants WHERE slug = 'motospace'
ON CONFLICT DO NOTHING;

-- Subcategorías para "Servicio técnico terceros"
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categorias_servicio
  WHERE nombre = 'Servicio técnico terceros'
    AND tenant_id = (SELECT id FROM tenants WHERE slug = 'motospace');

  IF cat_id IS NOT NULL THEN
    INSERT INTO subcategorias_servicio (categoria_id, nombre, orden) VALUES
      (cat_id, 'Particular', 1)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- PASO MANUAL (no ejecutar aquí):
-- 1. Ve a Supabase > Authentication > Users > Add User
-- 2. Email: tu-email@dominio.com, Password: (elige una segura)
-- 3. Copia el UUID del usuario creado
-- 4. Ejecuta este INSERT reemplazando UUID_DEL_USUARIO:
--
-- INSERT INTO usuarios (id, tenant_id, nombre, email, rol)
-- SELECT
--   'UUID_DEL_USUARIO',
--   t.id,
--   'Super Admin',
--   'tu-email@dominio.com',
--   'superadmin'
-- FROM tenants t WHERE t.slug = 'motospace';
--
-- ============================================================
