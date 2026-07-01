-- v62: Redes sociales del concesionario para cotizaciones
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_instagram text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_facebook  text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_tiktok    text;
