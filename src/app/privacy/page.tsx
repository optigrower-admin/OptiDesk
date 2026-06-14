export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy / Política de Privacidad</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated / Última actualización: June 14, 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">1. Who we are / Quiénes somos</h2>
          <p className="text-gray-600 leading-relaxed">
            OptiDesk is a multi-tenant SaaS CRM platform for service businesses (workshops, repair shops, and similar). It allows businesses to manage work orders, inventory, clients, and customer communications through WhatsApp Business API, Facebook Messenger, and Instagram Direct Messages.
          </p>
          <p className="text-gray-600 leading-relaxed mt-2">
            OptiDesk es una plataforma SaaS multi-tenant de CRM para negocios de servicio. Permite gestionar órdenes de trabajo, inventario, clientes y comunicaciones a través de WhatsApp Business API, Facebook Messenger e Instagram Direct.
          </p>
          <p className="text-gray-600 leading-relaxed mt-2">
            Contact / Contacto: <strong>optigrower@gmail.com</strong>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">2. Data we collect / Datos que recopilamos</h2>
          <ul className="list-disc pl-6 text-gray-600 space-y-2">
            <li>Account information: name, email address, business role.</li>
            <li>Business data: business name, logo, service configurations.</li>
            <li>Customer data: name, phone number, service history, vehicles.</li>
            <li>Messages: conversations received and sent through WhatsApp Business API, Facebook Messenger, and Instagram Direct Messages — processed solely in the context of the connected business.</li>
            <li>Meta platform data: Facebook Page IDs, Instagram Business Account IDs, Page Access Tokens (stored encrypted with AES-256-CBC).</li>
            <li>Usage logs: access records and operation audits.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">3. How we use the data / Cómo usamos los datos</h2>
          <ul className="list-disc pl-6 text-gray-600 space-y-2">
            <li>To provide CRM features: work order management, messaging inbox, inventory, reporting.</li>
            <li>To enable businesses to receive and reply to customer messages on WhatsApp, Messenger, and Instagram from a single dashboard.</li>
            <li>To generate internal reports and statistics for each business.</li>
            <li>To maintain, improve, and secure the platform.</li>
          </ul>
          <p className="text-gray-600 leading-relaxed mt-3">
            We do not sell or share your data with third parties outside of what is required to operate the platform (hosting, database).
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">4. Meta Platform Integration (WhatsApp, Messenger, Instagram)</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            OptiDesk uses the Meta Platforms APIs (WhatsApp Business Cloud API, Messenger Platform API, and Instagram Messaging API). When a business connects their Facebook Page or Instagram Business Account to OptiDesk:
          </p>
          <ul className="list-disc pl-6 text-gray-600 space-y-2">
            <li>Incoming and outgoing messages are processed and stored in our platform to display in the business messaging inbox.</li>
            <li>Page Access Tokens are stored encrypted with AES-256-CBC and never exposed to the client.</li>
            <li>We only access data necessary to provide the messaging features (messages, message reads, message deliveries).</li>
            <li>We comply with Meta's Platform Terms and Developer Policies.</li>
            <li>Businesses can disconnect their accounts at any time from the OptiDesk settings.</li>
            <li>We do not use Meta data for advertising or profiling.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">5. Data storage and security / Almacenamiento y seguridad</h2>
          <p className="text-gray-600 leading-relaxed">
            Data is stored in Supabase (PostgreSQL) servers with encryption at rest and in transit (TLS). Access is protected by authentication and Row Level Security (RLS) policies. Only authorized personnel within each business tenant can access their own data. Access tokens are encrypted using AES-256-CBC before storage.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">6. Data retention / Retención de datos</h2>
          <p className="text-gray-600 leading-relaxed">
            Data is retained while the business account is active. Upon cancellation, data can be deleted upon request within 30 days.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">7. Your rights / Tus derechos</h2>
          <p className="text-gray-600 leading-relaxed">
            You may request access, correction, or deletion of your data by emailing us. We respond within 15 business days.
          </p>
        </section>

        <section className="mb-8" id="data-deletion">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">8. Data Deletion / Eliminación de datos</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            To request deletion of your data or your business data from OptiDesk:
          </p>
          <ol className="list-decimal pl-6 text-gray-600 space-y-2">
            <li>Send an email to <strong>optigrower@gmail.com</strong> with subject: <strong>"Data Deletion Request"</strong></li>
            <li>Include your business name and the email used to register.</li>
            <li>We will confirm deletion within 15 business days.</li>
          </ol>
          <p className="text-gray-600 leading-relaxed mt-3">
            For Meta Platform data specifically: disconnecting your Facebook Page or Instagram account from OptiDesk settings will revoke our access tokens. You may also revoke app permissions directly from your Facebook Settings → Apps and Websites.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">9. Contact / Contacto</h2>
          <p className="text-gray-600 leading-relaxed">
            For any questions about this privacy policy:<br />
            Email: <strong>optigrower@gmail.com</strong><br />
            Platform: <strong>https://opti-desk.vercel.app</strong>
          </p>
        </section>
      </div>
    </div>
  )
}
