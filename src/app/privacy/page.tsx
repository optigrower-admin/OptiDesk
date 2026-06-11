export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-gray-500 mb-10">Última actualización: junio 2025</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">1. Quiénes somos</h2>
          <p className="text-gray-600 leading-relaxed">
            OptiDesk es una plataforma SaaS de gestión operacional para talleres y negocios de servicio técnico. Permite administrar órdenes de trabajo, inventario, clientes, equipo y comunicaciones a través de canales como WhatsApp Business, Messenger e Instagram.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">2. Datos que recopilamos</h2>
          <p className="text-gray-600 leading-relaxed mb-3">Recopilamos los siguientes tipos de datos:</p>
          <ul className="list-disc pl-6 text-gray-600 space-y-2">
            <li>Información de cuenta: nombre, correo electrónico, rol dentro del negocio.</li>
            <li>Datos del negocio: nombre del taller, logo, configuraciones del servicio.</li>
            <li>Datos de clientes del negocio: nombre, teléfono, historial de servicio, vehículos.</li>
            <li>Mensajes: conversaciones recibidas y enviadas a través de WhatsApp Business API, Messenger e Instagram (solo dentro del contexto del negocio).</li>
            <li>Datos de uso: registros de acceso, auditorías de operaciones.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">3. Cómo usamos los datos</h2>
          <ul className="list-disc pl-6 text-gray-600 space-y-2">
            <li>Proveer las funcionalidades de la plataforma (gestión de órdenes, mensajería, inventario).</li>
            <li>Permitir la comunicación entre el negocio y sus clientes finales a través de WhatsApp Business API.</li>
            <li>Generar reportes y estadísticas internas para el negocio.</li>
            <li>Mejorar y mantener el servicio.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">4. Integración con Meta (WhatsApp, Messenger, Instagram)</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            OptiDesk utiliza la API de WhatsApp Business Cloud, la API de Messenger y la API de Instagram de Meta Platforms, Inc. Al conectar tu cuenta de WhatsApp Business o páginas de Facebook/Instagram a OptiDesk:
          </p>
          <ul className="list-disc pl-6 text-gray-600 space-y-2">
            <li>Los mensajes entrantes y salientes son procesados y almacenados en nuestra plataforma para mostrarse en la bandeja de mensajes del negocio.</li>
            <li>Los tokens de acceso son almacenados cifrados con AES-256.</li>
            <li>No compartimos tu información con terceros fuera de Meta.</li>
            <li>Puedes desconectar los canales en cualquier momento desde la configuración de tu cuenta.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">5. Almacenamiento y seguridad</h2>
          <p className="text-gray-600 leading-relaxed">
            Los datos se almacenan en servidores de Supabase (PostgreSQL) con cifrado en reposo y en tránsito. El acceso está protegido por autenticación y políticas de seguridad a nivel de fila (Row Level Security). Solo el personal autorizado del negocio puede acceder a sus propios datos.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">6. Retención de datos</h2>
          <p className="text-gray-600 leading-relaxed">
            Los datos se conservan mientras la cuenta del negocio esté activa. Al cancelar el servicio, los datos pueden ser eliminados a solicitud del titular dentro de los 30 días siguientes.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">7. Tus derechos</h2>
          <p className="text-gray-600 leading-relaxed">
            Puedes solicitar acceso, corrección o eliminación de tus datos escribiendo a nuestro correo de contacto. Respondemos en un plazo máximo de 15 días hábiles.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">8. Eliminación de datos</h2>
          <p className="text-gray-600 leading-relaxed">
            Para solicitar la eliminación de tus datos o los datos de tu negocio, envía un correo a <strong>optigrower@gmail.com</strong> con el asunto "Eliminación de datos". Procesaremos la solicitud en un máximo de 15 días hábiles y confirmaremos la eliminación por correo.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">9. Contacto</h2>
          <p className="text-gray-600 leading-relaxed">
            Para cualquier consulta sobre esta política de privacidad, contáctanos en: <strong>optigrower@gmail.com</strong>
          </p>
        </section>
      </div>
    </div>
  )
}
