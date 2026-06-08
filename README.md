# OptiDesk

Sistema de gestión operativa para talleres de motocicletas. SaaS multi-tenant en producción.

## Stack

- **Next.js 14** App Router + TypeScript + Tailwind CSS
- **Supabase** — PostgreSQL + Auth + RLS (Row Level Security)
- **Cloudflare R2** — almacenamiento de fotos y videos (`optidesk-media`)
- **Google Drive** — archivado secundario via Service Account
- **Vercel** — hosting (plan Hobby)

## URLs

| | |
|---|---|
| Producción | https://opti-desk-git-main-optigrower-s-projects.vercel.app |
| GitHub | https://github.com/optigrower-admin/OptiDesk |
| Supabase | https://fnyvsgugviyrcqxsevji.supabase.co |
| Cuenta | optigrower@gmail.com |

## Roles

| Rol | Acceso |
|---|---|
| `control_total` | Super-admin — todas las empresas |
| `gerencia` | Panel completo + configuración de su empresa |
| `admin` | Panel operativo de su empresa |
| `mecanico` | Solo sus órdenes asignadas |

## Tablas en Supabase (20 tablas)

**Operativas:** `ordenes`, `items_orden`, `pagos_orden`, `clientes`, `motos`

**Inventario:** `repuestos_uma`, `repuestos_externos`, `proveedores`, `movimientos_inventario`

**Configuración:** `categorias_servicio`, `subcategorias_servicio`, `metodos_pago`

**Sistema:** `usuarios`, `tenants`, `permisos_roles`, `auditoria`

**Multimedia:** `medios`, `medios_perfil`, `logos`, `notas_perfil`

## Estructura de carpetas relevante

```
src/
├── app/
│   ├── admin/              # Panel de gerencia y admin
│   │   ├── ordenes/        # Gestión de órdenes ([id]/ + nueva/)
│   │   ├── repuestos/      # Inventario y ventas directas
│   │   ├── clientes/       # Gestión de clientes y motos
│   │   └── equipo/         # Gestión de usuarios
│   ├── mecanico/           # Panel del mecánico
│   ├── control_total/      # Super-admin
│   │   ├── herramientas/   # Monitoreo DB, acceso rápido plataformas
│   │   ├── tipos-servicio/ # Config categorías (UMA, Externo)
│   │   └── ...
│   ├── api/                # API routes (fotos, archivado, pagos)
│   └── login/
├── components/             # ClienteMotoPanel, ConsultaRepuestos, etc.
├── hooks/                  # useAuth, usePermisos
└── lib/                    # supabase client, clienteMoto, r2
supabase/
├── schema.sql              # Migración inicial
├── migration_v2.sql        # Migración v2
└── migration_v14_indexes.sql  # Índices de rendimiento
```

## Cómo desarrollar localmente

```bash
npm install
npm run dev
# → http://localhost:3000
```

Variables de entorno requeridas en `.env.local` (ver `OptiDesk_EnvVars.txt` en Desktop).

## Deploy

```
git add .
git commit -m "descripción"
git push origin main
# Vercel despliega automáticamente en ~2 min
```

El git author email debe ser `optigrower@gmail.com` para que Vercel acepte los commits.

## Migraciones de BD

Ejecutar en orden en el SQL Editor de Supabase:

1. `supabase/schema.sql`
2. `supabase/migration_v2.sql`
3. `supabase/migration_v14_indexes.sql`

## Reglas técnicas importantes

- Todos los `page.tsx` con `'use client'` deben tener `export const dynamic = 'force-dynamic'`
- `useSearchParams()` requiere Suspense boundary en Next.js 14
- La lógica `esUMA` en el detalle de orden es reactiva al `editCategoriaId` (no solo al valor guardado)
- El panel `# Orden UMA` aparece cuando la categoría seleccionada contiene "uma" en su nombre

## Empresa en producción

**Motospace38** — slug: `motospace38`
