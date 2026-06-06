-- ============================================================
-- OPTIDESK — Schema completo de base de datos
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLAS
-- ============================================================

-- Tabla: tenants (talleres/concesionarios)
CREATE TABLE IF NOT EXISTS tenants (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                      TEXT NOT NULL,
  slug                        TEXT UNIQUE NOT NULL,
  logo_url                    TEXT,
  activo                      BOOLEAN DEFAULT true,
  storage_usado_bytes         BIGINT DEFAULT 0,
  archivado_drive_habilitado  BOOLEAN DEFAULT false,
  drive_folder_id             TEXT,
  nombre_herramienta          TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now()
);

-- Tabla: usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  email       TEXT NOT NULL,
  rol         TEXT NOT NULL CHECK (rol IN ('mecanico', 'admin', 'superadmin')),
  pin         TEXT,
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Tabla: metodos_pago
CREATE TABLE IF NOT EXISTS metodos_pago (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  activo      BOOLEAN DEFAULT true,
  orden       INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Tabla: categorias_servicio
CREATE TABLE IF NOT EXISTS categorias_servicio (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  activo      BOOLEAN DEFAULT true,
  orden       INT DEFAULT 0
);

-- Tabla: subcategorias_servicio
CREATE TABLE IF NOT EXISTS subcategorias_servicio (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id  UUID NOT NULL REFERENCES categorias_servicio(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  activo        BOOLEAN DEFAULT true,
  orden         INT DEFAULT 0
);

-- Tabla: repuestos_uma
CREATE TABLE IF NOT EXISTS repuestos_uma (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo                      TEXT NOT NULL,
  descripcion                 TEXT NOT NULL,
  subgrupo                    TEXT,
  precio_publico_iva          DECIMAL(12,2),
  precio_publico_sin_iva      DECIMAL(12,2),
  precio_distribuidor_sin_iva DECIMAL(12,2),
  descuento                   DECIMAL(5,4) DEFAULT 0.34,
  cantidad                    INT DEFAULT 0,
  unidad_empaque              INT DEFAULT 1,
  modelos_aplicables          TEXT,
  activo                      BOOLEAN DEFAULT true,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, codigo)
);

-- Tabla: repuestos_externos
CREATE TABLE IF NOT EXISTS repuestos_externos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo                TEXT,
  nombre                TEXT NOT NULL,
  ultimo_costo          DECIMAL(12,2),
  ultimo_precio_venta   DECIMAL(12,2),
  registrado_por        UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Secuencia por tenant para números de orden (manejado via trigger)
CREATE TABLE IF NOT EXISTS tenant_order_sequences (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_number INT DEFAULT 0
);

-- Tabla: ordenes
CREATE TABLE IF NOT EXISTS ordenes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero                    INT NOT NULL,
  placa                     TEXT NOT NULL,
  cliente                   TEXT NOT NULL,
  categoria_servicio_id     UUID REFERENCES categorias_servicio(id) ON DELETE SET NULL,
  subcategoria_servicio_id  UUID REFERENCES subcategorias_servicio(id) ON DELETE SET NULL,
  estado                    TEXT NOT NULL DEFAULT 'en_proceso' CHECK (estado IN ('falta_revision', 'en_proceso', 'pendiente', 'listo')),
  motivo_pendiente          TEXT,
  estado_pago               TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pagado', 'abono', 'pendiente')),
  valor_total               DECIMAL(12,2) DEFAULT 0,
  valor_abono               DECIMAL(12,2) DEFAULT 0,
  metodo_pago_id            UUID REFERENCES metodos_pago(id) ON DELETE SET NULL,
  descripcion               TEXT,
  telefono                  TEXT,
  cedula                    TEXT,
  celular                   TEXT,
  tipo_orden                TEXT DEFAULT 'servicio' CHECK (tipo_orden IN ('servicio', 'venta_repuestos')),
  tipo_servicio             TEXT DEFAULT 'terceros' CHECK (tipo_servicio IN ('uma', 'terceros')),
  numero_ot                 TEXT,
  nota_ot                   TEXT,
  mecanico_id               UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, numero)
);

-- Vista para saldo pendiente calculado
CREATE OR REPLACE VIEW ordenes_con_saldo AS
SELECT
  o.*,
  (o.valor_total - o.valor_abono) AS saldo_pendiente
FROM ordenes o;

-- Tabla: items_orden
CREATE TABLE IF NOT EXISTS items_orden (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id              UUID NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  descripcion           TEXT NOT NULL,
  origen                TEXT NOT NULL CHECK (origen IN ('uma', 'externo', 'mano_obra')),
  repuesto_uma_id       UUID REFERENCES repuestos_uma(id) ON DELETE SET NULL,
  repuesto_externo_id   UUID REFERENCES repuestos_externos(id) ON DELETE SET NULL,
  cantidad              INT DEFAULT 1,
  costo                 DECIMAL(12,2) DEFAULT 0,
  precio_venta          DECIMAL(12,2) NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Tabla: medios
CREATE TABLE IF NOT EXISTS medios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id          UUID NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  tipo              TEXT NOT NULL CHECK (tipo IN ('imagen', 'video')),
  nombre_archivo    TEXT,
  tamano_bytes      BIGINT,
  storage_location  TEXT NOT NULL DEFAULT 'r2' CHECK (storage_location IN ('r2', 'drive')),
  drive_url         TEXT,
  subido_por        UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Tabla: permisos_roles
CREATE TABLE IF NOT EXISTS permisos_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rol         TEXT NOT NULL CHECK (rol IN ('mecanico', 'admin')),
  seccion     TEXT NOT NULL,
  habilitado  BOOLEAN DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, rol, seccion)
);

-- Tabla: auditoria
CREATE TABLE IF NOT EXISTS auditoria (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  tabla           TEXT NOT NULL,
  registro_id     UUID NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('movimiento', 'edicion', 'eliminacion')),
  valor_anterior  JSONB,
  valor_nuevo     JSONB,
  descripcion     TEXT,
  usuario_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant ON usuarios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_tenant ON ordenes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_placa ON ordenes(placa);
CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes(estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_created ON ordenes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_orden ON items_orden(orden_id);
CREATE INDEX IF NOT EXISTS idx_medios_orden ON medios(orden_id);
CREATE INDEX IF NOT EXISTS idx_medios_tenant ON medios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_repuestos_uma_tenant ON repuestos_uma(tenant_id);
CREATE INDEX IF NOT EXISTS idx_repuestos_uma_codigo ON repuestos_uma(codigo);
CREATE INDEX IF NOT EXISTS idx_auditoria_tenant ON auditoria(tenant_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria(created_at DESC);

-- ============================================================
-- FUNCIONES DE SOPORTE
-- ============================================================

-- Retorna el tenant_id del usuario autenticado
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT tenant_id FROM usuarios WHERE id = auth.uid();
$$;

-- Retorna el rol del usuario autenticado
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT rol FROM usuarios WHERE id = auth.uid();
$$;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger updated_at en ordenes
CREATE OR REPLACE TRIGGER trg_ordenes_updated_at
BEFORE UPDATE ON ordenes
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger updated_at en repuestos_uma
CREATE OR REPLACE TRIGGER trg_repuestos_uma_updated_at
BEFORE UPDATE ON repuestos_uma
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger updated_at en repuestos_externos
CREATE OR REPLACE TRIGGER trg_repuestos_externos_updated_at
BEFORE UPDATE ON repuestos_externos
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Función para generar número de orden secuencial por tenant
CREATE OR REPLACE FUNCTION generar_numero_orden()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_num INT;
BEGIN
  INSERT INTO tenant_order_sequences (tenant_id, last_number)
  VALUES (NEW.tenant_id, 1)
  ON CONFLICT (tenant_id)
  DO UPDATE SET last_number = tenant_order_sequences.last_number + 1
  RETURNING last_number INTO next_num;

  NEW.numero = next_num;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_orden_numero
BEFORE INSERT ON ordenes
FOR EACH ROW
WHEN (NEW.numero IS NULL OR NEW.numero = 0)
EXECUTE FUNCTION generar_numero_orden();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE metodos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategorias_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE repuestos_uma ENABLE ROW LEVEL SECURITY;
ALTER TABLE repuestos_externos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_orden ENABLE ROW LEVEL SECURITY;
ALTER TABLE medios ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_order_sequences ENABLE ROW LEVEL SECURITY;

-- ---- TENANTS ----
CREATE POLICY "superadmin_all_tenants" ON tenants
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "admin_read_own_tenant" ON tenants
FOR SELECT USING (id = get_user_tenant_id());

-- ---- USUARIOS ----
CREATE POLICY "superadmin_all_usuarios" ON usuarios
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "admin_usuarios_tenant" ON usuarios
FOR ALL USING (get_user_role() = 'admin' AND tenant_id = get_user_tenant_id());

CREATE POLICY "mecanico_read_own" ON usuarios
FOR SELECT USING (id = auth.uid());

-- ---- METODOS_PAGO ----
CREATE POLICY "superadmin_all_metodos" ON metodos_pago
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "tenant_read_metodos" ON metodos_pago
FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "admin_crud_metodos" ON metodos_pago
FOR ALL USING (get_user_role() = 'admin' AND tenant_id = get_user_tenant_id());

-- ---- CATEGORIAS_SERVICIO ----
CREATE POLICY "superadmin_all_categorias" ON categorias_servicio
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "tenant_read_categorias" ON categorias_servicio
FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "admin_crud_categorias" ON categorias_servicio
FOR ALL USING (get_user_role() = 'admin' AND tenant_id = get_user_tenant_id());

-- ---- SUBCATEGORIAS_SERVICIO ----
CREATE POLICY "superadmin_all_subcategorias" ON subcategorias_servicio
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "tenant_read_subcategorias" ON subcategorias_servicio
FOR SELECT USING (
  categoria_id IN (SELECT id FROM categorias_servicio WHERE tenant_id = get_user_tenant_id())
);

-- ---- REPUESTOS_UMA ----
CREATE POLICY "superadmin_all_repuestos_uma" ON repuestos_uma
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "tenant_read_repuestos_uma" ON repuestos_uma
FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "admin_crud_repuestos_uma" ON repuestos_uma
FOR ALL USING (get_user_role() = 'admin' AND tenant_id = get_user_tenant_id());

-- ---- REPUESTOS_EXTERNOS ----
CREATE POLICY "superadmin_all_repuestos_ext" ON repuestos_externos
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "tenant_read_repuestos_ext" ON repuestos_externos
FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_insert_repuestos_ext" ON repuestos_externos
FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "admin_update_repuestos_ext" ON repuestos_externos
FOR UPDATE USING (get_user_role() = 'admin' AND tenant_id = get_user_tenant_id());

-- ---- ORDENES ----
CREATE POLICY "superadmin_all_ordenes" ON ordenes
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "tenant_read_ordenes" ON ordenes
FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "mecanico_insert_ordenes" ON ordenes
FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND mecanico_id = auth.uid());

CREATE POLICY "mecanico_update_own_ordenes" ON ordenes
FOR UPDATE USING (tenant_id = get_user_tenant_id() AND mecanico_id = auth.uid());

CREATE POLICY "admin_crud_ordenes" ON ordenes
FOR ALL USING (get_user_role() = 'admin' AND tenant_id = get_user_tenant_id());

-- ---- ITEMS_ORDEN ----
CREATE POLICY "superadmin_all_items" ON items_orden
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "tenant_read_items" ON items_orden
FOR SELECT USING (
  orden_id IN (SELECT id FROM ordenes WHERE tenant_id = get_user_tenant_id())
);

CREATE POLICY "tenant_insert_items" ON items_orden
FOR INSERT WITH CHECK (
  orden_id IN (SELECT id FROM ordenes WHERE tenant_id = get_user_tenant_id())
);

CREATE POLICY "admin_update_items" ON items_orden
FOR UPDATE USING (
  get_user_role() = 'admin' AND
  orden_id IN (SELECT id FROM ordenes WHERE tenant_id = get_user_tenant_id())
);

CREATE POLICY "admin_delete_items" ON items_orden
FOR DELETE USING (
  get_user_role() = 'admin' AND
  orden_id IN (SELECT id FROM ordenes WHERE tenant_id = get_user_tenant_id())
);

-- ---- MEDIOS ----
CREATE POLICY "superadmin_all_medios" ON medios
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "tenant_read_medios" ON medios
FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_insert_medios" ON medios
FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "mecanico_delete_own_medios" ON medios
FOR DELETE USING (subido_por = auth.uid());

CREATE POLICY "admin_delete_medios" ON medios
FOR DELETE USING (get_user_role() = 'admin' AND tenant_id = get_user_tenant_id());

-- ---- AUDITORIA ----
CREATE POLICY "superadmin_all_auditoria" ON auditoria
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "tenant_read_auditoria" ON auditoria
FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "insert_auditoria" ON auditoria
FOR INSERT WITH CHECK (true);

-- ---- SEQUENCES ----
CREATE POLICY "superadmin_sequences" ON tenant_order_sequences
FOR ALL USING (get_user_role() = 'superadmin');

CREATE POLICY "tenant_sequences" ON tenant_order_sequences
FOR ALL USING (tenant_id = get_user_tenant_id());

-- ============================================================
-- FUNCIONES RPC PARA STORAGE
-- ============================================================

CREATE OR REPLACE FUNCTION increment_tenant_storage(p_tenant_id UUID, p_bytes BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE tenants SET storage_usado_bytes = storage_usado_bytes + p_bytes WHERE id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_tenant_storage(p_tenant_id UUID, p_bytes BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE tenants SET storage_usado_bytes = GREATEST(0, storage_usado_bytes - p_bytes) WHERE id = p_tenant_id;
END;
$$;
