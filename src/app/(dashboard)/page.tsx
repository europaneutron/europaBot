/**
 * Página principal del Dashboard
 */

export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Dashboard Principal
        </h2>
        <p className="text-gray-600">
          Bienvenido al panel de administración de EuropaBot
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card: Settings */}
        <a
          href="/dashboard/settings"
          className="block bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="text-4xl mb-4">⚙️</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Configuración
          </h3>
          <p className="text-gray-600">
            Ajusta el comportamiento del bot: checkpoints, scoring, fallback, etc.
          </p>
        </a>

        {/* Card: Intents */}
        <a
          href="/dashboard/intents"
          className="block bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="text-4xl mb-4">🎯</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Intenciones
          </h3>
          <p className="text-gray-600">
            Gestiona las intenciones y respuestas del bot
          </p>
        </a>

        {/* Card: Appointments */}
        <a
          href="/appointments"
          className="block bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="text-4xl mb-4">📅</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Citas
          </h3>
          <p className="text-gray-600">
            Ver y gestionar las citas agendadas
          </p>
        </a>
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          🎉 Fase 0 y Fase 1 Completadas
        </h3>
        <ul className="space-y-2 text-blue-800">
          <li>✅ Sistema de configuración dinámica funcionando</li>
          <li>✅ Editor de intenciones completo (crear, editar, eliminar)</li>
          <li>✅ Gestión de respuestas por intención</li>
          <li>✅ Message processor usando configuración dinámica</li>
        </ul>
      </div>
    </div>
  );
}
