/**
 * Pagina de detalle de conversacion (thread completo)
 * Ruta: /conversations/[userId]
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useConversationDetail } from '@/hooks/use-conversations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  User, 
  Bot, 
  Target, 
  Clock, 
  Phone, 
  Calendar,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronUp
} from 'lucide-react';

export default function ConversationDetailPage({
  params,
}: {
  params: { userId: string };
}) {
  const [userId, setUserId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);

  useEffect(() => {
    if (params && params.userId) {
      setUserId(params.userId);
    }
  }, [params]);

  const { detail, loading, loadingMore, error, loadMoreMessages } = useConversationDetail(userId);

  // Scroll al fondo cuando carga inicialmente
  useEffect(() => {
    if (detail && !initialScrollDone && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' });
      setInitialScrollDone(true);
    }
  }, [detail, initialScrollDone]);

  if (!userId || loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Cargando conversacion...
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="p-6 space-y-4">
        <div className="text-center py-12 text-destructive">
          {error || 'No se encontro la conversacion'}
        </div>
        <div className="text-center">
          <Button variant="ghost" asChild>
            <Link href="/conversations">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a conversaciones
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/conversations">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {detail.user.name || detail.user.phone_number}
          </h1>
          <p className="text-sm text-muted-foreground">
            {detail.user.phone_number}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal: Thread de mensajes */}
        <div className="lg:col-span-2">
          <Card className="flex flex-col h-[calc(100vh-220px)]">
            <CardHeader className="flex-shrink-0 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Historial de Mensajes</CardTitle>
                  <CardDescription>
                    {detail.messages.length} de {detail.totalMessages} mensajes
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-0">
              <div 
                ref={messagesContainerRef}
                className="h-full overflow-y-auto px-6 pb-4 bg-muted/30"
              >
                {/* Boton cargar mas mensajes */}
                {detail.hasMore && (
                  <div className="flex justify-center py-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMoreMessages}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Cargando...
                        </>
                      ) : (
                        <>
                          <ChevronUp className="h-4 w-4 mr-2" />
                          Cargar mensajes anteriores
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {detail.messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No hay mensajes en esta conversacion
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    {detail.messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Info del usuario */}
        <div className="space-y-4">
          {/* Card: Info del Usuario */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informacion del Usuario</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow 
                icon={User} 
                label="Nombre" 
                value={detail.user.name || 'Sin nombre'} 
              />
              <InfoRow 
                icon={Phone} 
                label="Telefono" 
                value={detail.user.phone_number} 
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Lead Status</span>
                <LeadBadge status={detail.user.lead_status} />
              </div>
              <InfoRow 
                label="Lead Score" 
                value={`${detail.user.lead_score} puntos`} 
              />
              <InfoRow 
                icon={Calendar}
                label="Registrado" 
                value={new Date(detail.user.created_at).toLocaleDateString('es-ES')} 
              />
            </CardContent>
          </Card>

          {/* Card: Progreso de Checkpoints */}
          {detail.checkpoints && detail.checkpoints.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Checkpoints</CardTitle>
                <CardDescription>
                  {detail.checkpoints.filter((c) => c.is_completed).length} de {detail.checkpoints.length} completados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {detail.checkpoints.map((checkpoint) => (
                    <div 
                      key={checkpoint.intent_name}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm">{checkpoint.display_name}</span>
                      {checkpoint.is_completed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/30" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card: Citas */}
          {detail.appointments.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Citas Agendadas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detail.appointments.map((apt: any) => (
                    <div
                      key={apt.id}
                      className="p-3 rounded-lg bg-muted/50 border-l-4 border-green-500"
                    >
                      <p className="text-sm font-medium">
                        {new Date(apt.appointment_date + 'T12:00:00').toLocaleDateString('es-ES', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {apt.time_slot}
                      </p>
                      <Badge 
                        variant="outline" 
                        className={`mt-2 ${
                          apt.status === 'confirmed' 
                            ? 'bg-green-100 text-green-700 border-green-200' 
                            : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                        }`}
                      >
                        {apt.status === 'confirmed' ? 'Confirmada' : apt.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Burbuja de mensaje estilo chat
 */
function MessageBubble({ message }: { message: any }) {
  const isUser = message.is_from_user;
  
  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-white border border-border rounded-tl-sm'
            : 'bg-primary text-primary-foreground rounded-tr-sm'
        }`}
      >
        {/* Etiqueta de remitente */}
        <div
          className={`text-xs font-medium mb-1 flex items-center gap-1 ${
            isUser ? 'text-muted-foreground' : 'text-primary-foreground/70'
          }`}
        >
          {isUser ? (
            <>
              <User className="h-3 w-3" />
              Usuario
            </>
          ) : (
            <>
              <Bot className="h-3 w-3" />
              Bot Europa
            </>
          )}
        </div>

        {/* Texto del mensaje */}
        <p className="text-sm whitespace-pre-wrap leading-relaxed">
          {message.message_text}
        </p>

        {/* Intent detectado (solo para mensajes del usuario) */}
        {message.intent_matched && isUser && (
          <div className={`mt-2 pt-2 border-t ${isUser ? 'border-border' : 'border-primary-foreground/20'}`}>
            <span className={`text-xs flex items-center gap-1 ${isUser ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
              <Target className="h-3 w-3" />
              Intent: <span className="font-medium">{message.intent_matched}</span>
            </span>
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`mt-2 text-xs flex items-center gap-1 ${
            isUser ? 'text-muted-foreground/70' : 'text-primary-foreground/60'
          }`}
        >
          <Clock className="h-3 w-3" />
          {new Date(message.created_at).toLocaleString('es-ES', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Fila de informacion
 */
function InfoRow({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon?: React.ComponentType<{ className?: string }>;
  label: string; 
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
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
