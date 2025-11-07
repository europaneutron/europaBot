/**
 * Página principal del Dashboard con métricas en tiempo real
 */

'use client';

import Link from 'next/link';
import { 
  useAnalytics, 
  useRecentConversations, 
  useUpcomingAppointments 
} from '@/hooks/use-analytics';

export default function DashboardPage() {
  const { metrics, loading: metricsLoading } = useAnalytics();
  const { data: recentConversations, loading: conversationsLoading } = useRecentConversations(5);
  const { data: upcomingAppointments, loading: appointmentsLoading } = useUpcomingAppointments(5);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Dashboard Principal
        </h2>
        <p className="text-gray-600">
          Bienvenido al panel de administración de EuropaBot
        </p>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Total Usuarios"
          value={metrics.totalUsers}
          icon="👥"
          loading={metricsLoading}
        />
        <MetricCard
          title="Conversaciones Hoy"
          value={metrics.conversationsToday}
          icon="💬"
          loading={metricsLoading}
        />
        <MetricCard
          title="Citas Pendientes"
          value={metrics.pendingAppointments}
          icon="📅"
          loading={metricsLoading}
        />
        <MetricCard
          title="Leads HOT"
          value={metrics.hotLeads}
          icon="🔥"
          loading={metricsLoading}
        />
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Link
          href="/settings"
          className="block bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
        >
          <div className="text-4xl mb-4">⚙️</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Configuración
          </h3>
          <p className="text-gray-600">
            Ajusta el comportamiento del bot: checkpoints, scoring, fallback, etc.
          </p>
        </Link>

        <Link
          href="/intents"
          className="block bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
        >
          <div className="text-4xl mb-4">🎯</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Intenciones
          </h3>
          <p className="text-gray-600">
            Gestiona las intenciones y respuestas del bot
          </p>
        </Link>

        <Link
          href="/appointments"
          className="block bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
        >
          <div className="text-4xl mb-4">📅</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Citas
          </h3>
          <p className="text-gray-600">
            Ver y gestionar las citas agendadas
          </p>
        </Link>
      </div>

      {/* Tablas: Últimas conversaciones y Próximas citas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Últimas Conversaciones */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Últimas Conversaciones
            </h3>
            <Link 
              href="/conversations" 
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Ver todas →
            </Link>
          </div>

          {conversationsLoading ? (
            <div className="text-center py-8 text-gray-500">
              Cargando...
            </div>
          ) : recentConversations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay conversaciones aún
            </div>
          ) : (
            <div className="space-y-3">
              {recentConversations.map((conv) => (
                <div 
                  key={conv.id}
                  className="border-l-4 border-blue-500 bg-gray-50 p-3 rounded"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900">
                      {conv.user_name || conv.user_phone}
                    </span>
                    <LeadBadge status={conv.lead_status} />
                  </div>
                  <p className="text-sm text-gray-600 truncate mb-1">
                    {conv.last_message}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(conv.last_message_time).toLocaleString('es-ES')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Próximas Citas */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Próximas Citas
            </h3>
            <Link 
              href="/appointments" 
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Ver todas →
            </Link>
          </div>

          {appointmentsLoading ? (
            <div className="text-center py-8 text-gray-500">
              Cargando...
            </div>
          ) : upcomingAppointments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay citas próximas
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingAppointments.map((apt) => (
                <div 
                  key={apt.id}
                  className="border-l-4 border-green-500 bg-gray-50 p-3 rounded"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900">
                      {apt.user_name || apt.user_phone}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      apt.status === 'confirmed' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {apt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    📅 {new Date(apt.appointment_date).toLocaleDateString('es-ES', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long'
                    })}
                  </p>
                  <p className="text-sm text-gray-600">
                    🕐 {apt.appointment_time}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Banner de estado del proyecto */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          🎉 Fases Completadas
        </h3>
        <ul className="space-y-2 text-blue-800">
          <li>✅ Fase 0: Sistema de configuración dinámica</li>
          <li>✅ Fase 1: Editor de intenciones y respuestas</li>
          <li>✅ Fase 2: Seguridad (RLS + Autenticación)</li>
          <li>✅ Fase 3.1: Refactorización Fallback</li>
          <li>✅ Fase 3.2: Lead Scoring Automatizado</li>
          <li>✅ Fase 3.3: Mensajes Personalizables</li>
          <li>🔄 Fase 4: Dashboard Completo (en progreso)</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Componente de tarjeta de métrica
 */
function MetricCard({ 
  title, 
  value, 
  icon, 
  loading 
}: { 
  title: string; 
  value: number; 
  icon: string; 
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          {loading ? (
            <div className="h-8 bg-gray-200 rounded w-16 animate-pulse"></div>
          ) : (
            <p className="text-3xl font-bold text-gray-900">{value}</p>
          )}
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  );
}

/**
 * Badge para lead status
 */
function LeadBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    hot: 'bg-red-100 text-red-800',
    warm: 'bg-yellow-100 text-yellow-800',
    cold: 'bg-blue-100 text-blue-800',
  };

  const labels: Record<string, string> = {
    hot: 'HOT',
    warm: 'WARM',
    cold: 'COLD',
  };

  return (
    <span className={`text-xs px-2 py-1 rounded font-medium ${colors[status] || colors.cold}`}>
      {labels[status] || status.toUpperCase()}
    </span>
  );
}
