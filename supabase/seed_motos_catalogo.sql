-- ============================================================
-- SEED — Catálogo de motos (Seguimiento Ventas)
-- Ejecutar UNA SOLA VEZ, después de migration_v39.
-- Ajusta los precios aquí antes de correrlo si han cambiado;
-- después de esta carga, Gerencia los administra desde la app.
-- ============================================================

INSERT INTO motos_catalogo (tenant_id, referencia, precio, costo_documentos, costo_prenda, orden)
SELECT t.id, v.referencia, v.precio, v.costo_documentos, v.costo_prenda, v.orden
FROM tenants t
CROSS JOIN (VALUES
  ('TORITO NG CARPA LUJO',                19999999, 1200000, 168880, 1),
  ('TORITO BASICO',                       17999000, 1200000, 168881, 2),
  ('TORITO CHEROKEE',                     21999000, 1200000, 168880, 3),
  ('TORITO UTILITARIO',                   22899000, 1200000, 168880, 4),
  ('MAXIMO CARGO PICK UP',                23799000, 1200000, 168880, 5),
  ('MAXIMO CARGO ESTACAS',                29099000, 1200000, 168881, 6),
  ('MAXIMO CARGO FURGON CARGA SECA',      32599000, 1200000, 168882, 7),
  ('MAXIMO CARGO FURGON CARGA SECA 2P',   33399000, 1200000, 168883, 8),
  ('MAXIMO CARGO FURGON CARGA AISLADO',   36299000, 1200000, 168883, 9),
  ('MAXIMO CARGO FURGON CARGA AISLADO 2P',37099000, 1200000, 168884, 10),
  ('BOXER CT 100 KS FRENOS CBS',          5899000,  814000,  168880, 11),
  ('BOXER CT 100 ES FRENOS CBS',          6199000,  814000,  168880, 12),
  ('BOXER CT 125 FRENOS CBS',             6899000,  814000,  168880, 13),
  ('DISCOVER 125 SPORT FRENOS CBS',       7499000,  814000,  168880, 14),
  ('PULSAR NS 125 UG',                    8799000,  814000,  168880, 15),
  ('PULSAR N 125',                        8099000,  814000,  168880, 16),
  ('PULSAR N 125 CARBURADA',              7599000,  814000,  168881, 17),
  ('BOXER 150 X',                         7499000,  926000,  168880, 18),
  ('PULSAR P150 FI ABS',                  8799000,  926000,  168880, 19),
  ('PULSAR N160 PRO O PREMIUM',           10999000, 954000,  168880, 20),
  ('PULSAR NS 160 ABS UG2',               11799000, 954000,  168880, 21),
  ('PULSAR NS 200 FI SC',                 13199000, 1100000, 168880, 22),
  ('PULSAR NS 200 FI ABS UG2',            15799000, 1100000, 168880, 23),
  ('PULSAR RS 200 FI ABS',                15999000, 1100000, 168880, 24),
  ('PULSAR N 250 FI ABS',                 13799000, 1530000, 168880, 25),
  ('PULSAR NS 400 Z',                     18299000, 1530000, 168880, 26),
  ('DOMINAR 400 PRO TOURING',             19399000, 1530000, 168880, 27),
  ('DOMINAR 400 VOLCANO SIN CONTINENTAL', 20399000, 1530000, 168880, 28),
  ('DOMINAR 400 VOLCANO CON CONTINENTAL', 21799000, 1530000, 168880, 29)
) AS v(referencia, precio, costo_documentos, costo_prenda, orden)
WHERE t.slug = 'motospace'
ON CONFLICT DO NOTHING;
