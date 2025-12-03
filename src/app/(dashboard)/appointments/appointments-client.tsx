'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Phone, Calendar, Clock, User, Archive } from 'lucide-react';
import { supabase } from '@/services/supabase/client';

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

interface Props {
  initialAppointments: AppointmentWithUser[];
}

function formatDate(isoDate: string): string {
  // Usar T12:00:00 (mediodia) para evitar que ajustes de timezone cambien el dia
  const date = new Date(isoDate + 'T12:00:00');
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

function getTimeSlotName(slot: string): string {
  const names: Record<string, string> = {
    'morning': 'Mañana',
    'afternoon': 'Mediodía',
    'evening': 'Tarde'
  };
  return names[slot] || slot;
}

function getStatusInfo(status: string): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string } {
  const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    'pending': { variant: 'outline', label: 'Pendiente' },
    'confirmed': { variant: 'default', label: 'Confirmada' },
    'cancelled': { variant: 'destructive', label: 'Cancelada' },
    'completed': { variant: 'secondary', label: 'Completada' }
  };
  return statusMap[status] || { variant: 'outline', label: status };
}

export function AppointmentsClient({ initialAppointments }: Props) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [loading, setLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'attended'>('active');

  const activeAppointments = appointments.filter(a => a.status !== 'completed');
  const attendedAppointments = appointments.filter(a => a.status === 'completed');

  const handleMarkAsCompleted = async (appointmentId: string) => {
    setLoading(appointmentId);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', appointmentId);

      if (error) throw error;

      setAppointments(prev =>
        prev.map(a => a.id === appointmentId ? { ...a, status: 'completed' } : a)
      );
    } catch (error) {
      console.error('Error updating appointment:', error);
    } finally {
      setLoading(null);
    }
  };

  const renderAppointmentCard = (appointment: AppointmentWithUser) => {
    const statusInfo = getStatusInfo(appointment.status);
    const user = Array.isArray(appointment.user) ? appointment.user[0] : appointment.user;

    return (
      <Card key={appointment.id}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {appointment.visitor_name}
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <a
                  href={`https://wa.me/${user?.phone_number?.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:text-green-700 hover:underline"
                >
                  {user?.phone_number || 'Sin teléfono'}
                </a>
                {user?.name && <span>• {user.name}</span>}
              </CardDescription>
            </div>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-medium">Fecha solicitada</p>
                <p className="font-medium">{formatDate(appointment.requested_date)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-medium">Horario</p>
                <p className="font-medium">{getTimeSlotName(appointment.time_slot)}</p>
                <p className="text-sm text-muted-foreground">
                  {appointment.time_slot_start} - {appointment.time_slot_end}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-4 border-t">
            <div>
              <span className="font-medium">Creada:</span> {formatDateTime(appointment.created_at)}
            </div>
            {appointment.agent_notified_at && (
              <div>
                <span className="font-medium">Agente notificado:</span> {formatDateTime(appointment.agent_notified_at)}
              </div>
            )}
            {user?.lead_score !== undefined && (
              <div>
                <span className="font-medium">Lead Score:</span>{' '}
                <span className={
                  user.lead_score >= 70 ? 'text-red-600 font-bold' :
                  user.lead_score >= 40 ? 'text-orange-600 font-bold' :
                  'text-blue-600 font-bold'
                }>
                  {user.lead_score}
                </span>
              </div>
            )}
          </div>

          {appointment.status !== 'completed' && (
            <div className="pt-4 border-t">
              <Button
                onClick={() => handleMarkAsCompleted(appointment.id)}
                disabled={loading === appointment.id}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {loading === appointment.id ? (
                  'Archivando...'
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Marcar como atendida
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Citas Agendadas</h2>
        <p className="text-muted-foreground">
          Gestiona las citas programadas desde el bot de WhatsApp
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'attended')}>
        <TabsList>
          <TabsTrigger value="active">
            Activas ({activeAppointments.length})
          </TabsTrigger>
          <TabsTrigger value="attended">
            <Archive className="h-4 w-4 mr-2" />
            Atendidas ({attendedAppointments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 mt-6">
          {activeAppointments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No hay citas activas
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {activeAppointments.map(renderAppointmentCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="attended" className="space-y-4 mt-6">
          {attendedAppointments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Archive className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No hay citas atendidas
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {attendedAppointments.map(renderAppointmentCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
