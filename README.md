# OptiDesk

Sistema de gestión operativa para talleres de motocicletas. SaaS multi-tenant en producción.

## Stack

- **Next.js 14** App Router + TypeScript + Tailwind CSS
- **Supabase** — PostgreSQL + Auth + Realtime + RLS (Row Level Security)
- **Cloudflare R2** — almacenamiento de fotos y videos (`optidesk-media`)
- **Google Drive** — archivado secundario via Service Account
- **Meta Graph API** — WhatsApp Business, Messenger, Instagram DMs
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
| `asesor` | Mensajería + seguimiento de ventas |
| `mecanico` | Solo sus órdenes asignadas |

## Módulos principales

### Mensajería (`/admin/mensajes`)
- **Bandeja** (`/bandeja`) — Inbox unificado WhatsApp/Messenger/Instagram. Mobile-responsive con vista de lista + chat. Fondo azul para conversaciones automatizadas.
- **Flujos** (`/flujos`) — Constructor visual de flujos de automatización (ReactFlow). Nodos: trigger, mensaje, condición, esperar, capturar_dato, asignar, etapa, etiqueta, agente_ia, plantilla, media, nota_interna, subflujo, fin.
- **Plantillas** — Gestión de plantillas Meta aprobadas para WhatsApp.

### Seguimiento de Ventas (`/admin/ventas`)
- Kanban por etapas con drag & drop.
- Tarjetas azules para leads en automatización activa.
- Archivar cliente limpia `whatsapp_number` para que una re-entrada cree nuevo registro.

### Órdenes, Repuestos, Clientes — módulos operativos del taller.

## Sistema de Flujos de Automatización

### Motor de ejecución (`src/lib/mensajeria/flow-executor.ts`)
- `iniciarFlujoParaConversacion` — busca flujo activo por trigger y crea ejecución.
- `continuarEjecucion` — procesa nodos hasta pausar, terminar o error.
- `procesarEjecucionesPendientes` — procesado por cron de ejecuciones con delay vencido.

### Nodos disponibles

| Nodo | Descripción |
|---|---|
| `trigger` | Disparador: mensaje_nuevo, nuevo_cliente, lead_ad, etapa_cambiada, sin_respuesta_24h |
| `mensaje` | Envía texto libre o plantilla Meta aprobada |
| `esperar` | Pausa N horas — al recibir mensaje siguiente se retoma inmediatamente |
| `condicion` | Bifurcación SÍ/NO por palabras_clave, es_numero, respuesta_contiene, longitud_mayor, ia_evalua, etc. |
| `capturar_dato` | **Nuevo** — guarda `ultimo_mensaje` en campo del cliente (nombre/celular/email/cedula) o en variable `{{variables.X}}` |
| `asignar` | Asigna asesor: round_robin o usuario_fijo |
| `etapa` | Cambia etapa de venta del cliente |
| `etiqueta` | Agrega o quita etiqueta al cliente |
| `agente_ia` | Llama a OpenAI o Anthropic y envía la respuesta |
| `plantilla` | Envía plantilla Meta aprobada (para ventanas fuera de 24h) |
| `media` | Envía imagen, documento, audio o video |
| `nota_interna` | Crea nota visible solo para el equipo |
| `subflujo` | Inicia otro flujo como ejecución separada |
| `fin` | Marca la ejecución como completada |

### Variables en mensajes
```
{{nombre}}              Nombre del cliente
{{celular}}             Celular del cliente
{{canal}}               Canal (whatsapp/messenger/instagram)
{{etapa}}               Etapa de venta actual
{{ultimo_mensaje}}      Último mensaje recibido
{{variables.NOMBRE}}    Variable guardada por nodo capturar_dato
```

### Patrón Q&A (preguntas y validación)
```
[Mensaje] Pregunta
[Esperar 24h]           ← cualquier respuesta lo retoma
[Condición] es_numero   ← valida el dato
  SÍ → [capturar_dato] celular   ← guarda en DB solo si validó
  NO → [Mensaje] "El número no es válido, intenta de nuevo" → [Esperar] → vuelve a validar
```

## Webhook de Meta

Dos rutas:
- `/api/webhooks/meta/[tenant_id]/route.ts` — full inline
- `/api/webhooks/meta/route.ts` — usa `webhook-processor.ts`

El processor `webhook-processor.ts`:
- Crea conversación si no existe, **sin asignar asesor** a menos que el cliente ya tuviera uno o haya una `regla_asignacion` activa configurada.
- Llama `buscarOCrearCliente` para WhatsApp con el nombre del perfil.
- Inicia flujo con `await iniciarFlujoParaConversacion` (bloqueante para evitar que Vercel termine la función antes).

## Tablas en Supabase (principales)

**Mensajería:** `conversaciones`, `mensajes`, `plantillas_mensajes`, `flujos_automatizacion`, `flujo_ejecuciones`, `agentes_ia`, `config_apis_ia`, `config_meta`, `reglas_asignacion`

**Clientes:** `clientes`, `clientes_etiquetas`, `etiquetas`, `historial_etapas_cliente`

**Operativas:** `ordenes`, `items_orden`, `pagos_orden`, `motos`

**Inventario:** `repuestos_uma`, `repuestos_externos`, `proveedores`, `movimientos_inventario`

**Sistema:** `usuarios`, `tenants`, `permisos_roles`, `auditoria`

## Estructura de carpetas relevante

```
src/
├── app/
│   ├── admin/
│   │   ├── mensajes/
│   │   │   ├── bandeja/        # Inbox unificado (mobile-responsive)
│   │   │   ├── flujos/         # Constructor de flujos (ReactFlow)
│   │   │   └── plantillas/     # Plantillas Meta
│   │   ├── ventas/             # Kanban seguimiento de ventas
│   │   ├── clientes/           # Gestión de clientes
│   │   ├── ordenes/            # Gestión de órdenes
│   │   └── equipo/             # Gestión de usuarios
│   ├── api/
│   │   ├── webhooks/meta/      # Webhooks WhatsApp/Messenger/Instagram
│   │   └── admin/              # API routes internas
│   └── login/
├── lib/
│   ├── mensajeria/
│   │   ├── flow-executor.ts    # Motor de ejecución de flujos
│   │   ├── webhook-processor.ts # Procesador de webhooks Meta
│   │   └── push.ts             # Notificaciones push
│   ├── clientes/
│   │   └── buscarOCrearCliente.ts # Busca/crea cliente por canal
│   └── supabase/               # Clientes server/client/admin
└── types/
    └── flujos.ts               # Tipos para flujos de automatización
```

## Cómo desarrollar localmente

```bash
npm install
npm run dev
# → http://localhost:3000
```

Variables de entorno requeridas en `.env.local` (ver `OptiDesk_EnvVars.txt` en Desktop).

## Deploy

```bash
git add .
git commit -m "descripción"
git push origin main
# Vercel despliega automáticamente en ~2 min
```

El git author email debe ser `optigrower@gmail.com` para que Vercel acepte los commits.

## Reglas técnicas importantes

- Todos los `page.tsx` con `'use client'` deben tener `export const dynamic = 'force-dynamic'`
- `useSearchParams()` requiere Suspense boundary en Next.js 14
- Las llamadas a flujos en el webhook deben ser `await` (no fire-and-forget) — Vercel serverless termina antes de que resuelvan las promesas non-blocking
- `buscarOCrearCliente` con celular solo encuentra clientes con `en_seguimiento_ventas=true` para evitar que un cliente archivado bloquee la creación de uno nuevo

## Empresa en producción

**Motospace38** — slug: `motospace38`
