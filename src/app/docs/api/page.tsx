export const dynamic = 'force-dynamic'

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-4 overflow-x-auto my-2">
      <code>{children}</code>
    </pre>
  )
}

function Endpoint({ metodo, path, desc, permiso, curl }: { metodo: string; path: string; desc: string; permiso: string; curl: string }) {
  const color = metodo === 'GET' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
  return (
    <div className="border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${color}`}>{metodo}</span>
        <code className="text-sm font-mono text-gray-900">{path}</code>
      </div>
      <p className="text-sm text-gray-600 mb-2">{desc}</p>
      <p className="text-xs text-gray-400 mb-2">Requiere permiso: <strong>{permiso}</strong></p>
      <Code>{curl}</Code>
    </div>
  )
}

export default function DocsApiPage() {
  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8 text-gray-800">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API pública de OptiDesk</h1>
        <p className="text-sm text-gray-500 mt-2">
          Genera tu API key en <strong>Integraciones → API Keys</strong> dentro de OptiDesk. Cada key
          tiene permisos de lectura y/o escritura por recurso, y solo puede ver los datos de tu propio taller.
        </p>
      </div>

      <div>
        <h2 className="font-semibold text-gray-900 mb-2">Autenticación</h2>
        <p className="text-sm text-gray-600 mb-2">
          Envía tu API key en el header <code className="bg-gray-100 px-1 rounded">Authorization</code>:
        </p>
        <Code>{`Authorization: Bearer opk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Code>
        <p className="text-xs text-gray-400 mt-2">
          Límite: 100 solicitudes por minuto por key. Si te pasas, la API responde <code>429</code>.
        </p>
      </div>

      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Clientes</h2>
        <Endpoint
          metodo="GET" path="/api/v1/clientes" permiso="clientes: lectura"
          desc="Lista los clientes del tenant. Parámetros opcionales: page, limit (máx 100), search."
          curl={`curl "https://opti-desk.vercel.app/api/v1/clientes?page=1&limit=20" \\
  -H "Authorization: Bearer opk_live_..."`}
        />
        <Endpoint
          metodo="POST" path="/api/v1/clientes" permiso="clientes: escritura"
          desc="Crea un cliente nuevo."
          curl={`curl -X POST "https://opti-desk.vercel.app/api/v1/clientes" \\
  -H "Authorization: Bearer opk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"nombre": "Juan Pérez", "celular": "3001234567"}'`}
        />
      </div>

      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Conversaciones</h2>
        <Endpoint
          metodo="GET" path="/api/v1/conversaciones" permiso="conversaciones: lectura"
          desc="Lista las conversaciones del tenant. Parámetros opcionales: page, limit, canal (whatsapp|messenger|instagram|manual), estado (abierta|pendiente|resuelta|archivada)."
          curl={`curl "https://opti-desk.vercel.app/api/v1/conversaciones?canal=whatsapp" \\
  -H "Authorization: Bearer opk_live_..."`}
        />
      </div>

      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Pagos</h2>
        <Endpoint
          metodo="GET" path="/api/v1/pagos" permiso="pagos: lectura"
          desc="Lista los pagos registrados a clientes. Parámetro opcional: cliente_id."
          curl={`curl "https://opti-desk.vercel.app/api/v1/pagos?cliente_id=..." \\
  -H "Authorization: Bearer opk_live_..."`}
        />
        <Endpoint
          metodo="POST" path="/api/v1/pagos" permiso="pagos: escritura"
          desc="Registra un pago para un cliente."
          curl={`curl -X POST "https://opti-desk.vercel.app/api/v1/pagos" \\
  -H "Authorization: Bearer opk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"cliente_id": "uuid-del-cliente", "monto": 150000, "metodo_pago": "Transferencia"}'`}
        />
      </div>

      <div>
        <h2 className="font-semibold text-gray-900 mb-2">Errores</h2>
        <p className="text-sm text-gray-600">
          Todos los errores devuelven <code className="bg-gray-100 px-1 rounded">{'{ "error": "mensaje" }'}</code> con el status HTTP correspondiente:
          <code className="bg-gray-100 px-1 rounded mx-1">401</code> key inválida/revocada/expirada,
          <code className="bg-gray-100 px-1 rounded mx-1">403</code> sin permiso para ese recurso,
          <code className="bg-gray-100 px-1 rounded mx-1">429</code> límite de solicitudes excedido,
          <code className="bg-gray-100 px-1 rounded mx-1">500</code> error interno.
        </p>
      </div>
    </div>
  )
}
