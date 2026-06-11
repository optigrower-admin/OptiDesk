export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Términos de Servicio</h1>
        <p className="text-sm text-gray-500 mb-10">Última actualización: junio 2025</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">1. Aceptación de los términos</h2>
          <p className="text-gray-600 leading-relaxed">
            Al registrarse y utilizar OptiDesk, usted acepta estos Términos de Servicio en su totalidad. Si no está de acuerdo con alguna parte de estos términos, no debe usar el servicio.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">2. Descripción del servicio</h2>
          <p className="text-gray-600 leading-relaxed">
            OptiDesk es una plataforma SaaS de gestión operacional que permite a talleres mecánicos y negocios de servicio técnico administrar órdenes de trabajo, inventario, clientes, equipo de trabajo y comunicaciones vía WhatsApp Business, Messenger e Instagram.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">3. Uso aceptable</h2>
          <p className="text-gray-600 leading-relaxed mb-3">El usuario se compromete a:</p>
          <ul className="list-disc pl-6 text-gray-600 space-y-2">
            <li>Usar el servicio únicamente con fines legales y comerciales legítimos.</li>
            <li>No usar la plataforma para enviar spam, mensajes masivos no solicitados o contenido ilegal.</li>
            <li>Cumplir con las políticas de uso de WhatsApp Business, Meta Messenger e Instagram.</li>
            <li>Mantener la confidencialidad de sus credenciales de acceso.</li>
            <li>No intentar acceder a datos de otros negocios registrados en la plataforma.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">4. Integración con servicios de terceros</h2>
          <p className="text-gray-600 leading-relaxed">
            OptiDesk se integra con servicios de Meta (WhatsApp Business API, Messenger API, Instagram API). El uso de estas integraciones está sujeto a las políticas y términos de uso de Meta Platforms, Inc. OptiDesk no es responsable de cambios, interrupciones o restricciones aplicadas por Meta a sus APIs.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">5. Responsabilidad</h2>
          <p className="text-gray-600 leading-relaxed">
            OptiDesk provee el servicio "tal como está". No garantizamos disponibilidad ininterrumpida. No somos responsables por pérdidas de negocio derivadas de interrupciones del servicio, fallos de terceros (Meta, Supabase, Vercel) o uso indebido de la plataforma por parte del usuario.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">6. Propiedad intelectual</h2>
          <p className="text-gray-600 leading-relaxed">
            Todo el código, diseño, marca y contenido de OptiDesk son propiedad exclusiva de sus creadores. Los datos ingresados por el negocio (clientes, órdenes, mensajes) son propiedad del negocio registrado.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">7. Cancelación</h2>
          <p className="text-gray-600 leading-relaxed">
            El usuario puede cancelar su cuenta en cualquier momento. OptiDesk puede suspender o cancelar cuentas que violen estos términos. Tras la cancelación, los datos pueden ser solicitados para exportación dentro de los 30 días siguientes.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">8. Modificaciones</h2>
          <p className="text-gray-600 leading-relaxed">
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios serán notificados dentro de la plataforma. El uso continuado del servicio implica aceptación de los nuevos términos.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">9. Contacto</h2>
          <p className="text-gray-600 leading-relaxed">
            Para consultas sobre estos términos: <strong>optigrower@gmail.com</strong>
          </p>
        </section>
      </div>
    </div>
  )
}
