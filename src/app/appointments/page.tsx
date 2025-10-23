/**
 * Página de visualización de citas
 * Para testing y verificación
 */

import { supabaseServer } from '@/services/supabase/server-client';

// Desactivar cache de Next.js para esta página
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AppointmentWithUser {
  id: string;
  visitor_name: string;
  requested_date: string;
  appointment_date: string;
  time_slot: string;
  time_slot_start: string;
  time_slot_end: string;
  status: string;
  agent_notified_at: string | null;
  created_at: string;
  user: {
    phone_number: string;
    name: string | null;
    lead_score: number;
  };
}

async function getAppointments(): Promise<AppointmentWithUser[]> {
  const { data, error } = await supabaseServer
    .from('appointments')
    .select(`
      id,
      visitor_name,
      requested_date,
      appointment_date,
      time_slot,
      time_slot_start,
      time_slot_end,
      status,
      agent_notified_at,
      created_at,
      user:users!appointments_user_id_fkey (
        phone_number,
        name,
        lead_score
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching appointments:', error);
    return [];
  }

  return data as any;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getTimeSlotEmoji(slot: string): string {
  const emojis: Record<string, string> = {
    'morning': '🌅',
    'afternoon': '☀️',
    'evening': '🌆'
  };
  return emojis[slot] || '🕐';
}

function getTimeSlotName(slot: string): string {
  const names: Record<string, string> = {
    'morning': 'Mañana',
    'afternoon': 'Mediodía',
    'evening': 'Tarde'
  };
  return names[slot] || slot;
}

function getStatusBadge(status: string): { color: string; label: string } {
  const badges: Record<string, { color: string; label: string }> = {
    'pending': { color: 'bg-yellow-100 text-yellow-800', label: 'Pendiente' },
    'confirmed': { color: 'bg-green-100 text-green-800', label: 'Confirmada' },
    'cancelled': { color: 'bg-red-100 text-red-800', label: 'Cancelada' },
    'completed': { color: 'bg-blue-100 text-blue-800', label: 'Completada' }
  };
  return badges[status] || { color: 'bg-gray-100 text-gray-800', label: status };
}

export default async function AppointmentsPage() {
  const appointments = await getAppointments();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">📅 Citas Agendadas</h1>
          <p className="mt-2 text-gray-600">
            Total: <span className="font-semibold">{appointments.length}</span> citas
          </p>
        </div>

        {/* Lista de citas */}
        {appointments.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg">No hay citas agendadas aún</p>
            <p className="text-gray-400 mt-2">Las citas aparecerán aquí cuando se agenden desde el bot</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {appointments.map((appointment) => {
              const statusBadge = getStatusBadge(appointment.status);
              const user = Array.isArray(appointment.user) ? appointment.user[0] : appointment.user;

              return (
                <div
                  key={appointment.id}
                  className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
                >
                  <div className="flex items-start justify-between">
                    {/* Info principal */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h2 className="text-xl font-bold text-gray-900">
                          {appointment.visitor_name}
                        </h2>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                      </div>

                      {/* Teléfono y WhatsApp */}
                      <div className="flex items-center gap-2 text-gray-700 mb-2">
                        <span className="text-sm">📱</span>
                        <a
                          href={`https://wa.me/${user?.phone_number?.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-700 font-medium text-sm"
                        >
                          {user?.phone_number || 'Sin teléfono'}
                        </a>
                        {user?.name && (
                          <span className="text-gray-500 text-sm">
                            • {user.name}
                          </span>
                        )}
                      </div>

                      {/* Fecha y horario */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div className="flex items-start gap-2">
                          <span className="text-2xl">📅</span>
                          <div>
                            <p className="text-xs text-gray-500 uppercase">Fecha solicitada</p>
                            <p className="font-semibold text-gray-900">
                              {formatDate(appointment.requested_date)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <span className="text-2xl">{getTimeSlotEmoji(appointment.time_slot)}</span>
                          <div>
                            <p className="text-xs text-gray-500 uppercase">Horario</p>
                            <p className="font-semibold text-gray-900">
                              {getTimeSlotName(appointment.time_slot)}
                            </p>
                            <p className="text-sm text-gray-600">
                              {appointment.time_slot_start} - {appointment.time_slot_end}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
                        <div>
                          <span className="font-medium">Creada:</span>{' '}
                          {formatDateTime(appointment.created_at)}
                        </div>
                        {appointment.agent_notified_at && (
                          <div>
                            <span className="font-medium">Agente notificado:</span>{' '}
                            {formatDateTime(appointment.agent_notified_at)}
                          </div>
                        )}
                        {user?.lead_score !== undefined && (
                          <div>
                            <span className="font-medium">Lead Score:</span>{' '}
                            <span className={`font-bold ${
                              user.lead_score >= 70 ? 'text-red-600' :
                              user.lead_score >= 40 ? 'text-orange-600' :
                              'text-blue-600'
                            }`}>
                              {user.lead_score}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ID (pequeño) */}
                    <div className="text-xs text-gray-400 font-mono ml-4">
                      {appointment.id.split('-')[0]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Link de regreso */}
        <div className="mt-8 text-center">
          <a
            href="/test"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Volver al chat de prueba
          </a>
        </div>
      </div>
    </div>
  );
}
