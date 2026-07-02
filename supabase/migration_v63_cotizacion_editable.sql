-- v63: Campos editables en cotización por producto y por tenant

-- 4ta foto por moto: tipo 'extra' — ya funciona con la tabla motos_catalogo_fotos existente
-- Solo se agrega como nueva opción de tipo, no requiere cambio de esquema.

-- Beneficios de venta editables por moto (uno por línea, formato: emoji Título|Descripción)
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS cotizacion_beneficios text;
-- Ej: "🚀 Movilidad sin límites|Evita trancones, llega a tiempo\n💰 Inversión inteligente|Ahorra hasta 4x en combustible"

-- Ítems "Esta cotización incluye" editables por tenant (uno por línea)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_incluye text;
-- Ej: "SOAT obligatorio\nMatrícula + impuestos\nGarantía de fábrica\n3 revisiones mano de obra gratis"
