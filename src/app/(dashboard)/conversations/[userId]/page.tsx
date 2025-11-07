/**
 * Página de detalle de conversación (thread completo)
 * Ruta: /conversations/[userId]
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useConversationDetail } from '@/hooks/use-conversations';

export default function ConversationDetailPage({
  params,
}: {
  params: { userId: string };
}) {
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    // Resolver params de forma asíncrona si es necesario
    if (params && params.userId) {
      setUserId(params.userId);
    }
  }, [params]);

  const { detail, loading, error } = useConversationDetail(userId);

  if (!userId || loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-gray-500">
          Cargando conversación...
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-red-500">
          {error || 'No se encontró la conversación'}
        </div>
        <div className="text-center">
          <Link href="/conversations" className="text-blue-600 hover:text-blue-800">
            ← Volver a conversaciones
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/conversations"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          ← Volver a conversaciones
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Conversación con {detail.user.name || detail.user.phone_number}
        </h2>
        <p className="text-gray-600">
          ID: {detail.user.id}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal: Thread de mensajes */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Historial de Mensajes ({detail.messages.length})
              </h3>
            </div>

            <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto bg-gray-50">
              {detail.messages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No hay mensajes en esta conversación
                </div>
              ) : (
                detail.messages.map((message: any) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.is_from_user ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${
                        message.is_from_user
                          ? 'bg-white text-gray-900 rounded-tl-none border border-gray-200'
                          : 'bg-blue-500 text-white rounded-tr-none'
                      }`}
                    >
                      {/* Etiqueta de remitente */}
                      <div
                        className={`text-xs font-semibold mb-1 ${
                          message.is_from_user ? 'text-gray-500' : 'text-blue-100'
                        }`}
                      >
                        {message.is_from_user ? '👤 Usuario' : '🤖 Bot Europa'}
                      </div>

                      {/* Texto del mensaje */}
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">
                        {message.message_text}
                      </p>

                      {/* Intent detectado (solo para mensajes del usuario) */}
                      {message.intent_matched && message.is_from_user && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <span className="text-xs text-gray-500">
                            🎯 Intent: <span className="font-medium">{message.intent_matched}</span>
                          </span>
                        </div>
                      )}

                      {/* Timestamp */}
                      <div
                        className={`mt-2 text-xs ${
                          message.is_from_user ? 'text-gray-400' : 'text-blue-100'
                        }`}
                      >
                        {new Date(message.created_at).toLocaleString('es-ES', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Info del usuario */}
        <div className="space-y-6">
          {/* Card: Info del Usuario */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Información del Usuario
            </h3>

            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Nombre</p>
                <p className="text-sm font-medium text-gray-900">
                  {detail.user.name || 'Sin nombre'}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Teléfono</p>
                <p className="text-sm font-medium text-gray-900">
                  {detail.user.phone_number}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Lead Status</p>
                <div className="mt-1">
                  <LeadBadge status={detail.user.lead_status} />
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">Lead Score</p>
                <p className="text-sm font-medium text-gray-900">
                  {detail.user.lead_score} puntos
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Registrado</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(detail.user.created_at).toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>
          </div>

          {/* Card: Progreso de Checkpoints */}
          {detail.progress && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Checkpoints Completados
              </h3>

              <div className="space-y-2">
                <CheckpointItem
                  label="Precio"
                  completed={detail.progress.checkpoint_precio}
                />
                <CheckpointItem
                  label="Ubicación"
                  completed={detail.progress.checkpoint_ubicacion}
                />
                <CheckpointItem
                  label="Modelo"
                  completed={detail.progress.checkpoint_modelo}
                />
                <CheckpointItem
                  label="Créditos"
                  completed={detail.progress.checkpoint_creditos}
                />
                <CheckpointItem
                  label="Seguridad"
                  completed={detail.progress.checkpoint_seguridad}
                />
                <CheckpointItem
                  label="Brochure"
                  completed={detail.progress.checkpoint_brochure}
                />
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Total: {detail.progress.checkpoints_completed || 0} / 6
                </p>
              </div>
            </div>
          )}

          {/* Card: Citas */}
          {detail.appointments.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Citas Agendadas
              </h3>

              <div className="space-y-3">
                {detail.appointments.map((apt: any) => (
                  <div
                    key={apt.id}
                    className="border-l-4 border-green-500 bg-gray-50 p-3 rounded"
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(apt.appointment_date).toLocaleDateString('es-ES', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </p>
                    <p className="text-sm text-gray-600">
                      🕐 {apt.time_slot}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Estado: {apt.status}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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
    <span
      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
        colors[status] || colors.cold
      }`}
    >
      {labels[status] || status.toUpperCase()}
    </span>
  );
}

/**
 * Item de checkpoint
 */
function CheckpointItem({
  label,
  completed,
}: {
  label: string;
  completed: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      {completed ? (
        <span className="text-green-600 text-sm">✓</span>
      ) : (
        <span className="text-gray-300 text-sm">○</span>
      )}
    </div>
  );
}
