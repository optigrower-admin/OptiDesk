-- v65: "Esta cotización incluye" editable por vehículo
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS cotizacion_incluye text;
-- Formato: una línea por ítem, igual que tenant.cotizacion_incluye
-- Ej: "🛡️ SOAT obligatorio\n📋 Matrícula + impuestos\n🏭 Garantía de fábrica"
-- Si está vacío, cae al default del tenant o a los predeterminados del sistema.
