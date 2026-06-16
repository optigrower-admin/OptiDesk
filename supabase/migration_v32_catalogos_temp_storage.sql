-- Migration v32: Bucket temporal para carga de catálogos grandes (Repuestos UMA / Lubricantes)
-- El navegador sube el Excel directo a Supabase Storage (sin pasar por la función
-- serverless de Vercel, que tiene un límite de ~4.5 MB por petición) y el servidor
-- lo descarga con la service role key para procesarlo y luego lo borra.
-- Ejecutar en Supabase → SQL Editor

INSERT INTO storage.buckets (id, name, public)
VALUES ('catalogos-temp', 'catalogos-temp', false)
ON CONFLICT (id) DO NOTHING;

-- Solo gerencia/admin/control_total pueden subir, y únicamente dentro de la
-- carpeta de su propio tenant (primer segmento de la ruta = tenant_id).
CREATE POLICY "catalogos_temp_insert_propio_tenant"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'catalogos-temp'
  AND (storage.foldername(name))[1] = (
    SELECT tenant_id::text FROM usuarios WHERE id = auth.uid()
  )
  AND (SELECT rol FROM usuarios WHERE id = auth.uid()) IN ('control_total', 'gerencia', 'admin')
);
