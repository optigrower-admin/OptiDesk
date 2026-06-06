-- ============================================================
-- OPTIDESK — Migration v2: Clientes, Motos, Inventario
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- ── CLIENTES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  cedula      TEXT,
  celular     TEXT,
  email       TEXT,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Cédula única por tenant (solo cuando tiene valor)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_cedula_unique
  ON clientes(tenant_id, cedula) WHERE cedula IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_tenant   ON clientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_celular  ON clientes(tenant_id, celular);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre   ON clientes(tenant_id, lower(nombre));

-- ── MOTOS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS motos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  placa       TEXT NOT NULL,
  cliente_id  UUID REFERENCES clientes(id) ON DELETE SET NULL,
  marca       TEXT,
  modelo      TEXT,
  año         INT,
  color       TEXT,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, placa)
);

CREATE INDEX IF NOT EXISTS idx_motos_tenant    ON motos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_motos_cliente   ON motos(cliente_id);

-- ── MOVIMIENTOS_INVENTARIO ────────────────────────────────
-- Registra cada entrada (compra) y salida (uso/venta) de repuesto
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  motivo                TEXT NOT NULL CHECK (motivo IN ('compra', 'devolucion', 'uso_st', 'venta_directa', 'ajuste')),
  repuesto_uma_id       UUID REFERENCES repuestos_uma(id) ON DELETE SET NULL,
  repuesto_externo_id   UUID REFERENCES repuestos_externos(id) ON DELETE SET NULL,
  cantidad              INT NOT NULL CHECK (cantidad > 0),
  costo_unitario        DECIMAL(12,2),
  precio_unitario       DECIMAL(12,2),
  orden_id              UUID REFERENCES ordenes(id) ON DELETE SET NULL,
  item_orden_id         UUID REFERENCES items_orden(id) ON DELETE SET NULL,
  proveedor             TEXT,
  numero_factura        TEXT,
  notas                 TEXT,
  registrado_por        UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_tenant        ON movimientos_inventario(tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_created       ON movimientos_inventario(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_repuesto_uma  ON movimientos_inventario(repuesto_uma_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_repuesto_ext  ON movimientos_inventario(repuesto_externo_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_orden         ON movimientos_inventario(orden_id);

-- ── ALTER ORDENES ─────────────────────────────────────────
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS moto_id    UUID REFERENCES motos(id)    ON DELETE SET NULL;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ordenes_moto    ON ordenes(moto_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_cliente ON ordenes(cliente_id);

-- ── TRIGGERS updated_at ───────────────────────────────────
CREATE OR REPLACE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_motos_updated_at
  BEFORE UPDATE ON motos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ──────────────────────────────────────────────────
ALTER TABLE clientes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE motos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;

-- CLIENTES
DROP POLICY IF EXISTS "superadmin_all_clientes" ON clientes;
DROP POLICY IF EXISTS "tenant_read_clientes"    ON clientes;
DROP POLICY IF EXISTS "tenant_insert_clientes"  ON clientes;
DROP POLICY IF EXISTS "admin_update_clientes"   ON clientes;
CREATE POLICY "superadmin_all_clientes"  ON clientes FOR ALL    USING (get_user_role() = 'superadmin');
CREATE POLICY "tenant_read_clientes"     ON clientes FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_insert_clientes"   ON clientes FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "admin_update_clientes"    ON clientes FOR UPDATE USING (tenant_id = get_user_tenant_id());

-- MOTOS
DROP POLICY IF EXISTS "superadmin_all_motos"   ON motos;
DROP POLICY IF EXISTS "tenant_read_motos"      ON motos;
DROP POLICY IF EXISTS "tenant_insert_motos"    ON motos;
DROP POLICY IF EXISTS "admin_update_motos"     ON motos;
CREATE POLICY "superadmin_all_motos"     ON motos FOR ALL    USING (get_user_role() = 'superadmin');
CREATE POLICY "tenant_read_motos"        ON motos FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_insert_motos"      ON motos FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "admin_update_motos"       ON motos FOR UPDATE USING (tenant_id = get_user_tenant_id());

-- MOVIMIENTOS_INVENTARIO
DROP POLICY IF EXISTS "superadmin_all_movimientos" ON movimientos_inventario;
DROP POLICY IF EXISTS "tenant_read_movimientos"    ON movimientos_inventario;
DROP POLICY IF EXISTS "tenant_insert_movimientos"  ON movimientos_inventario;
DROP POLICY IF EXISTS "admin_crud_movimientos"     ON movimientos_inventario;
CREATE POLICY "superadmin_all_movimientos"  ON movimientos_inventario FOR ALL    USING (get_user_role() = 'superadmin');
CREATE POLICY "tenant_read_movimientos"     ON movimientos_inventario FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_insert_movimientos"   ON movimientos_inventario FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "admin_crud_movimientos"      ON movimientos_inventario FOR ALL    USING (get_user_role() = 'admin' AND tenant_id = get_user_tenant_id());

-- ── GRANTS ────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON clientes               TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON motos                  TO authenticated, anon;
GRANT SELECT, INSERT         ON movimientos_inventario TO authenticated, anon;
