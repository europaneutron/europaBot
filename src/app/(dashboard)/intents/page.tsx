/**
 * Página de Lista de Intenciones
 * Muestra todas las intenciones configuradas del bot
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { intentConfigRepositoryClient, IntentConfiguration } from '@/data/repositories/intent-config.repository.client';

export default function IntentsPage() {
  const [intents, setIntents] = useState<IntentConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIntents();
  }, []);

  async function loadIntents() {
    try {
      setLoading(true);
      const data = await intentConfigRepositoryClient.getAll();
      setIntents(data);
    } catch (err) {
      console.error('Error loading intents:', err);
      setError('Error al cargar intenciones');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(id: string, currentStatus: boolean) {
    try {
      await intentConfigRepositoryClient.update(id, { is_active: !currentStatus });
      // Recargar lista
      await loadIntents();
    } catch (err) {
      console.error('Error toggling intent:', err);
      alert('Error al actualizar intención');
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🎯 Intenciones del Bot
          </h1>
          <p className="text-gray-600">
            Gestiona las intenciones y patrones de reconocimiento del bot
          </p>
        </div>
        <Link
          href="/intents/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
        >
          <span className="mr-2">+</span>
          Nueva Intención
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Checkpoint
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Prioridad
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Keywords
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {intents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No hay intenciones configuradas
                </td>
              </tr>
            ) : (
              intents.map((intent) => (
                <tr key={intent.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {intent.display_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {intent.intent_name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleActive(intent.id, intent.is_active)}
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        intent.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {intent.is_active ? '✅ Activo' : '❌ Inactivo'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      intent.is_checkpoint
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {intent.is_checkpoint ? '✅ Sí' : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {intent.priority}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {intent.keywords.slice(0, 3).join(', ')}
                    {intent.keywords.length > 3 && ` (+${intent.keywords.length - 3})`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Link
                      href={`/intents/${intent.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Editar
                    </Link>
                    <Link
                      href={`/intents/${intent.id}/responses`}
                      className="text-green-600 hover:text-green-900"
                    >
                      Respuestas
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Total de intenciones: {intents.length} | Activas: {intents.filter(i => i.is_active).length} | Checkpoints: {intents.filter(i => i.is_checkpoint).length}
      </div>
    </div>
  );
}
