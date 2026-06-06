-- ============================================================
-- OPTIDESK — Migration v5: Actualizar RLS superadmin → control_total
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- ── TENANTS ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_tenants" ON tenants;
CREATE POLICY "control_total_all_tenants" ON tenants
  FOR ALL USING (get_user_role() = 'control_total');

-- ── USUARIOS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_usuarios" ON usuarios;
DROP POLICY IF EXISTS "admin_usuarios_tenant"   ON usuarios;
CREATE POLICY "control_total_all_usuarios" ON usuarios
  FOR ALL USING (get_user_role() = 'control_total');

-- Gerencia y admin pueden gestionar usuarios de su tenant
CREATE POLICY "admin_usuarios_tenant" ON usuarios
  FOR ALL USING (
    get_user_role() IN ('admin', 'gerencia')
    AND tenant_id = get_user_tenant_id()
  );

-- ── METODOS_PAGO ──────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_metodos" ON metodos_pago;
DROP POLICY IF EXISTS "admin_crud_metodos"      ON metodos_pago;
CREATE POLICY "control_total_all_metodos" ON metodos_pago
  FOR ALL USING (get_user_role() = 'control_total');
CREATE POLICY "admin_crud_metodos" ON metodos_pago
  FOR ALL USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id());

-- ── CATEGORIAS_SERVICIO ───────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_categorias" ON categorias_servicio;
DROP POLICY IF EXISTS "admin_crud_categorias"      ON categorias_servicio;
CREATE POLICY "control_total_all_categorias" ON categorias_servicio
  FOR ALL USING (get_user_role() = 'control_total');
CREATE POLICY "admin_crud_categorias" ON categorias_servicio
  FOR ALL USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id());

-- ── SUBCATEGORIAS_SERVICIO ────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_subcategorias" ON subcategorias_servicio;
CREATE POLICY "control_total_all_subcategorias" ON subcategorias_servicio
  FOR ALL USING (get_user_role() = 'control_total');

-- ── REPUESTOS_UMA ─────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_repuestos_uma" ON repuestos_uma;
DROP POLICY IF EXISTS "admin_crud_repuestos_uma"      ON repuestos_uma;
CREATE POLICY "control_total_all_repuestos_uma" ON repuestos_uma
  FOR ALL USING (get_user_role() = 'control_total');
CREATE POLICY "admin_crud_repuestos_uma" ON repuestos_uma
  FOR ALL USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id());

-- ── REPUESTOS_EXTERNOS ────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_repuestos_ext" ON repuestos_externos;
DROP POLICY IF EXISTS "admin_update_repuestos_ext"    ON repuestos_externos;
CREATE POLICY "control_total_all_repuestos_ext" ON repuestos_externos
  FOR ALL USING (get_user_role() = 'control_total');
CREATE POLICY "admin_update_repuestos_ext" ON repuestos_externos
  FOR UPDATE USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id());

-- ── ORDENES ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_ordenes" ON ordenes;
DROP POLICY IF EXISTS "admin_crud_ordenes"      ON ordenes;
CREATE POLICY "control_total_all_ordenes" ON ordenes
  FOR ALL USING (get_user_role() = 'control_total');
CREATE POLICY "admin_crud_ordenes" ON ordenes
  FOR ALL USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id());

-- ── ITEMS_ORDEN ───────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_items" ON items_orden;
DROP POLICY IF EXISTS "admin_update_items"    ON items_orden;
DROP POLICY IF EXISTS "admin_delete_items"    ON items_orden;
CREATE POLICY "control_total_all_items" ON items_orden
  FOR ALL USING (get_user_role() = 'control_total');
CREATE POLICY "admin_update_items" ON items_orden
  FOR UPDATE USING (
    get_user_role() IN ('admin', 'gerencia') AND
    orden_id IN (SELECT id FROM ordenes WHERE tenant_id = get_user_tenant_id())
  );
CREATE POLICY "admin_delete_items" ON items_orden
  FOR DELETE USING (
    get_user_role() IN ('admin', 'gerencia') AND
    orden_id IN (SELECT id FROM ordenes WHERE tenant_id = get_user_tenant_id())
  );

-- ── MEDIOS ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_medios" ON medios;
DROP POLICY IF EXISTS "admin_delete_medios"    ON medios;
CREATE POLICY "control_total_all_medios" ON medios
  FOR ALL USING (get_user_role() = 'control_total');
CREATE POLICY "admin_delete_medios" ON medios
  FOR DELETE USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id());

-- ── AUDITORIA ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_auditoria" ON auditoria;
CREATE POLICY "control_total_all_auditoria" ON auditoria
  FOR ALL USING (get_user_role() = 'control_total');

-- ── SEQUENCES ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_sequences" ON tenant_order_sequences;
CREATE POLICY "control_total_sequences" ON tenant_order_sequences
  FOR ALL USING (get_user_role() = 'control_total');

-- ── CLIENTES (migration_v2) ───────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_clientes" ON clientes;
DROP POLICY IF EXISTS "admin_update_clientes"    ON clientes;
CREATE POLICY "control_total_all_clientes" ON clientes
  FOR ALL USING (get_user_role() = 'control_total');
CREATE POLICY "admin_update_clientes" ON clientes
  FOR UPDATE USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id());

-- ── MOTOS (migration_v2) ──────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_motos" ON motos;
DROP POLICY IF EXISTS "admin_update_motos"    ON motos;
CREATE POLICY "control_total_all_motos" ON motos
  FOR ALL USING (get_user_role() = 'control_total');
CREATE POLICY "admin_update_motos" ON motos
  FOR UPDATE USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id());

-- ── MOVIMIENTOS_INVENTARIO (migration_v2) ─────────────────────
DROP POLICY IF EXISTS "superadmin_all_movimientos" ON movimientos_inventario;
DROP POLICY IF EXISTS "admin_crud_movimientos"      ON movimientos_inventario;
CREATE POLICY "control_total_all_movimientos" ON movimientos_inventario
  FOR ALL USING (get_user_role() = 'control_total');
CREATE POLICY "admin_crud_movimientos" ON movimientos_inventario
  FOR ALL USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id());

-- ── PERMISOS_ROLES ────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_permisos" ON permisos_roles;
CREATE POLICY "control_total_all_permisos" ON permisos_roles
  FOR ALL USING (get_user_role() = 'control_total');

DROP POLICY IF EXISTS "gerencia_permisos_tenant" ON permisos_roles;
CREATE POLICY "gerencia_permisos_tenant" ON permisos_roles
  FOR ALL USING (get_user_role() = 'gerencia' AND tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "tenant_read_permisos" ON permisos_roles;
CREATE POLICY "tenant_read_permisos" ON permisos_roles
  FOR SELECT USING (tenant_id = get_user_tenant_id());

-- ── VERIFICAR ─────────────────────────────────────────────────
SELECT tablename, policyname FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
