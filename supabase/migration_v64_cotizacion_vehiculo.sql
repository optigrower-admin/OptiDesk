-- v64: Badges y testimonio editables por vehículo en cotizaciones

-- Badges (3 íconos de confianza, uno por línea, formato: emoji|Título|Subtítulo)
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS cotizacion_badges text;
-- Ej: "🛡️|GARANTÍA|12 MESES*\n⭐|CALIDAD|CERTIFICADA\n👍|CLIENTES|SATISFECHOS"

-- Testimonio del cliente (formato: Texto|Nombre del cliente)
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS cotizacion_testimonial text;
-- Ej: "Excelente atención. Me asesoraron y la entrega fue rápida.|Cliente satisfecho"
