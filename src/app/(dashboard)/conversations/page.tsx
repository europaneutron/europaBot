/**
 * Página de lista de conversaciones con filtros
 * Ruta: /conversations
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useConversations, ConversationFilters } from '@/hooks/use-conversations';
import { exportToCSV, generateCSVFilename } from '@/lib/utils/export-csv';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export default function ConversationsPage() {
  const [filters, setFilters] = useState<ConversationFilters>({});
  const { conversations, loading, error } = useConversations(filters);

  const handleFilterChange = (key: keyof ConversationFilters, value: any) => {
    setFilters((prev: ConversationFilters) => ({ ...prev, [key]: value }));
  };

  function handleExportCSV() {
    exportToCSV(
      conversations,
      [
        { key: 'user_name', header: 'Nombre' },
        { key: 'user_phone', header: 'Teléfono' },
        { key: 'lead_status', header: 'Lead Status' },
        { key: 'lead_score', header: 'Score' },
        { key: 'last_intent', header: 'Última Intención' },
        {
          key: 'last_message_time',
          header: 'Última Interacción',
          format: (val: any) => new Date(val).toLocaleString('es-MX'),
        },
        {
          key: 'has_appointment',
          header: 'Tiene Cita',
          format: (val: any) => (val ? 'Sí' : 'No'),
        },
        {
          key: 'appointment_date',
          header: 'Fecha Cita',
          format: (val: any) => (val ? new Date(val).toLocaleString('es-MX') : ''),
        },
        { key: 'last_message', header: 'Último Mensaje' },
        { key: 'message_count', header: 'Total Mensajes' },
      ],
      generateCSVFilename('conversaciones')
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Conversaciones
        </h2>
        <p className="text-gray-600">
          Gestiona y revisa todas las conversaciones del bot
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filtros</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Búsqueda */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Buscar
            </label>
            <input
              type="text"
              placeholder="Teléfono o nombre..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
            />
          </div>

          {/* Lead Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Estado de Lead
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => handleFilterChange('leadStatus', e.target.value || undefined)}
            >
              <option value="">Todos</option>
              <option value="cold">COLD</option>
              <option value="warm">WARM</option>
              <option value="hot">HOT</option>
            </select>
          </div>

          {/* Tiene Cita */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Citas
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                const value = e.target.value;
                handleFilterChange(
                  'hasAppointment',
                  value === '' ? undefined : value === 'true'
                );
              }}
            >
              <option value="">Todos</option>
              <option value="true">Con cita</option>
              <option value="false">Sin cita</option>
            </select>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha desde
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => handleFilterChange('startDate', e.target.value || undefined)}
            />
          </div>
        </div>

        {/* Botón limpiar filtros */}
        <div className="mt-4">
          <button
            onClick={() => setFilters({})}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Lista de conversaciones */}
      <div className="bg-white rounded-lg shadow">
        {/* Header de tabla */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {conversations.length} conversaciones
            </h3>
            <Button
              onClick={handleExportCSV}
              variant="outline"
              size="sm"
              disabled={conversations.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            Cargando conversaciones...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-500">
            {error}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No se encontraron conversaciones
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lead Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mensajes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Último mensaje
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cita
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {conversations.map((conv: any) => (
                  <tr key={conv.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {conv.user_name || 'Sin nombre'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {conv.user_phone}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <LeadBadge status={conv.lead_status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {conv.lead_score}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {conv.message_count}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {conv.last_message}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(conv.last_message_time).toLocaleString('es-ES')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {conv.has_appointment ? (
                        <span className="text-green-600 text-sm">✓ Sí</span>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/conversations/${conv.user_id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Ver detalle →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${colors[status] || colors.cold}`}>
      {labels[status] || status.toUpperCase()}
    </span>
  );
}
