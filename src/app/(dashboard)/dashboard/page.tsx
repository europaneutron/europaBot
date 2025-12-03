/**
 * Pagina principal del Dashboard con metricas en tiempo real
 * Ruta: /dashboard
 */

'use client';

import Link from 'next/link';
import { 
  useAnalytics, 
  useRecentConversations, 
  useUpcomingAppointments 
} from '@/hooks/use-analytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  MessageSquare, 
  Calendar, 
  Flame, 
  Settings, 
  Target, 
  CalendarCheck,
  ArrowRight,
  Clock
} from 'lucide-react';

export default function DashboardPage() {
  const { metrics, loading: metricsLoading } = useAnalytics();
  const { data: recentConversations, loading: conversationsLoading } = useRecentConversations(5);
  const { data: upcomingAppointments, loading: appointmentsLoading } = useUpcomingAppointments(5);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Bienvenido al panel de administracion de EuropaBot
        </p>
      </div>

      {/* Metricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Usuarios"
          value={metrics.totalUsers}
          icon={Users}
          loading={metricsLoading}
          color="blue"
        />
        <MetricCard
          title="Conversaciones Hoy"
          value={metrics.conversationsToday}
          icon={MessageSquare}
          loading={metricsLoading}
          color="green"
        />
        <MetricCard
          title="Citas Pendientes"
          value={metrics.pendingAppointments}
          icon={Calendar}
          loading={metricsLoading}
          color="purple"
        />
        <MetricCard
          title="Leads HOT"
          value={metrics.hotLeads}
          icon={Flame}
          loading={metricsLoading}
          color="red"
        />
      </div>

      {/* Accesos rapidos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/settings" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Settings className="h-5 w-5 text-slate-600" />
                </div>
                <CardTitle className="text-lg">Configuracion</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Ajusta el comportamiento del bot: checkpoints, scoring, fallback, etc.
              </CardDescription>
            </CardContent>
          </Card>
        </Link>

        <Link href="/intents" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Target className="h-5 w-5 text-orange-600" />
                </div>
                <CardTitle className="text-lg">Intenciones</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Gestiona las intenciones y respuestas del bot
              </CardDescription>
            </CardContent>
          </Card>
        </Link>

        <Link href="/appointments" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CalendarCheck className="h-5 w-5 text-green-600" />
                </div>
                <CardTitle className="text-lg">Citas</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Ver y gestionar las citas agendadas
              </CardDescription>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Tablas: Ultimas conversaciones y Proximas citas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ultimas Conversaciones */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Ultimas Conversaciones</CardTitle>
                <CardDescription>Interacciones recientes con usuarios</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/conversations">
                  Ver todas
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {conversationsLoading ? (
              <div className="py-8 text-center text-muted-foreground">
                Cargando...
              </div>
            ) : recentConversations.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No hay conversaciones aun
              </div>
            ) : (
              <div className="space-y-3">
                {recentConversations.map((conv: any) => (
                  <div 
                    key={conv.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="w-1 h-full min-h-[50px] bg-blue-500 rounded-full" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium truncate">
                          {conv.user_name || conv.user_phone}
                        </span>
                        <LeadBadge status={conv.lead_status} />
                      </div>
                      <p className="text-sm text-muted-foreground truncate mb-1">
                        {conv.last_message}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(conv.last_message_time).toLocaleString('es-ES')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Proximas Citas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Proximas Citas</CardTitle>
                <CardDescription>Citas agendadas para los proximos dias</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/appointments">
                  Ver todas
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {appointmentsLoading ? (
              <div className="py-8 text-center text-muted-foreground">
                Cargando...
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No hay citas proximas
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingAppointments.map((apt: any) => (
                  <div 
                    key={apt.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="w-1 h-full min-h-[50px] bg-green-500 rounded-full" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium truncate">
                          {apt.user_name || apt.user_phone}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={apt.status === 'confirmed' 
                            ? 'bg-green-100 text-green-700 border-green-200' 
                            : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                          }
                        >
                          {apt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(apt.appointment_date).toLocaleDateString('es-ES', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long'
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {apt.appointment_time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

/**
 * Componente de tarjeta de metrica con icono Lucide
 */
function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  loading,
  color
}: { 
  title: string; 
  value: number; 
  icon: React.ComponentType<{ className?: string }>; 
  loading: boolean;
  color: 'blue' | 'green' | 'purple' | 'red';
}) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            {loading ? (
              <div className="h-8 bg-muted rounded w-16 animate-pulse"></div>
            ) : (
              <p className="text-3xl font-bold">{value}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Badge para lead status con colores
 */
function LeadBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { className: string; label: string }> = {
    hot: { className: 'bg-red-100 text-red-700 border-red-200', label: 'HOT' },
    warm: { className: 'bg-orange-100 text-orange-700 border-orange-200', label: 'WARM' },
    cold: { className: 'bg-blue-100 text-blue-700 border-blue-200', label: 'COLD' },
  };

  const config = statusConfig[status] || statusConfig.cold;

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
