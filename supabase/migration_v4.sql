-- ============================================================
-- OPTIDESK — Migration v4: Renombrar superadmin → control_total
--                           + Fix rol de optigrower a gerencia
-- ============================================================

-- 1. Actualizar constraint en usuarios
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'control_total'));

-- 2. Renombrar el valor en filas existentes
UPDATE usuarios SET rol = 'control_total' WHERE rol = 'superadmin';

-- 3. Cambiar optigrower@gmail.com a gerencia (era admin)
UPDATE usuarios SET rol = 'gerencia' WHERE email = 'optigrower@gmail.com';

-- 4. Verificar resultado
SELECT email, rol FROM usuarios ORDER BY rol;
