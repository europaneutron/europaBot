/**
 * Página para Gestionar Respuestas de una Intención
 */

'use client';

import { useState, useEffect } from 'react';
import { intentConfigRepositoryClient, IntentConfiguration, BotResponse } from '@/data/repositories/intent-config.repository.client';

export default function IntentResponsesPage({ params }: { params: { intentId: string } }) {
  const [intent, setIntent] = useState<IntentConfiguration | null>(null);
  const [responses, setResponses] = useState<BotResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [showForm, setShowForm] = useState(false);
  const [editingResponse, setEditingResponse] = useState<BotResponse | null>(null);
  
  const [formData, setFormData] = useState({
    response_key: '',
    message_text: '',
    media_url: '',
    order_priority: 1,
    is_active: true,
    variables: {}
  });

  useEffect(() => {
    loadData();
  }, [params.intentId]);

  async function loadData() {
    try {
      setLoading(true);
      
      const intentData = await intentConfigRepositoryClient.getById(params.intentId);
      if (!intentData) {
        setMessage({ type: 'error', text: 'Intención no encontrada' });
        return;
      }
      
      setIntent(intentData);
      
      const responsesData = await intentConfigRepositoryClient.getResponsesByIntent(intentData.intent_name);
      setResponses(responsesData);
      
    } catch (error) {
      console.error('Error loading data:', error);
      setMessage({ type: 'error', text: 'Error al cargar datos' });
    } finally {
      setLoading(false);
    }
  }

  function handleNewResponse() {
    setEditingResponse(null);
    setFormData({
      response_key: '',
      message_text: '',
      media_url: '',
      order_priority: responses.length + 1,
      is_active: true,
      variables: {}
    });
    setShowForm(true);
  }

  function handleEditResponse(response: BotResponse) {
    setEditingResponse(response);
    setFormData({
      response_key: response.response_key,
      message_text: response.message_text,
      media_url: response.media_url || '',
      order_priority: response.order_priority,
      is_active: response.is_active,
      variables: response.variables || {}
    });
    setShowForm(true);
  }

  async function handleSubmitResponse(e: React.FormEvent) {
    e.preventDefault();
    
    if (!intent) return;
    
    if (!formData.response_key.trim() || !formData.message_text.trim()) {
      setMessage({ type: 'error', text: 'Response key y mensaje son requeridos' });
      return;
    }

    try {
      const responseData = {
        intent_name: intent.intent_name,
        response_key: formData.response_key.trim(),
        message_text: formData.message_text.trim(),
        media_url: formData.media_url.trim() || null,
        order_priority: formData.order_priority,
        is_active: formData.is_active,
        variables: formData.variables
      };

      if (editingResponse) {
        // Actualizar existente
        await intentConfigRepositoryClient.updateResponse(editingResponse.id, responseData);
        setMessage({ type: 'success', text: '✅ Respuesta actualizada' });
      } else {
        // Crear nueva
        await intentConfigRepositoryClient.createResponse(responseData);
        setMessage({ type: 'success', text: '✅ Respuesta creada' });
      }

      setShowForm(false);
      await loadData();
      
      setTimeout(() => setMessage(null), 3000);

    } catch (error) {
      console.error('Error saving response:', error);
      setMessage({ type: 'error', text: '❌ Error al guardar respuesta' });
    }
  }

  async function handleDeleteResponse(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta respuesta?')) return;

    try {
      await intentConfigRepositoryClient.deleteResponse(id);
      setMessage({ type: 'success', text: '✅ Respuesta eliminada' });
      await loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error deleting response:', error);
      setMessage({ type: 'error', text: '❌ Error al eliminar respuesta' });
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!intent) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Intención no encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          💬 Respuestas para: {intent.display_name}
        </h1>
        <p className="text-gray-600">
          Gestiona los mensajes que el bot enviará cuando detecte esta intención
        </p>
      </div>

      {/* Mensaje de estado */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Lista de respuestas */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">
            Respuestas configuradas ({responses.length})
          </h2>
          <button
            onClick={handleNewResponse}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            + Agregar Respuesta
          </button>
        </div>

        <div className="divide-y divide-gray-200">
          {responses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No hay respuestas configuradas. Agrega una para comenzar.
            </div>
          ) : (
            responses.map((response) => (
              <div key={response.id} className="p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                        {response.response_key}
                      </span>
                      <span className="text-sm text-gray-500">
                        Orden: {response.order_priority}
                      </span>
                      {!response.is_active && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <p className="text-gray-800 whitespace-pre-wrap">
                      {response.message_text}
                    </p>
                    {response.media_url && (
                      <p className="text-sm text-blue-600 mt-2">
                        📎 Media: {response.media_url}
                      </p>
                    )}
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleEditResponse(response)}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteResponse(response.id)}
                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Formulario de creación/edición */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingResponse ? 'Editar Respuesta' : 'Nueva Respuesta'}
          </h3>

          <form onSubmit={handleSubmitResponse} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Response Key *
              </label>
              <input
                type="text"
                value={formData.response_key}
                onChange={(e) => setFormData({ ...formData, response_key: e.target.value })}
                placeholder="main_response"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Identificador único de la respuesta (sin espacios)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mensaje *
              </label>
              <textarea
                value={formData.message_text}
                onChange={(e) => setFormData({ ...formData, message_text: e.target.value })}
                placeholder="Escribe el mensaje que el bot enviará..."
                rows={6}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Usa \n para saltos de línea
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Media URL (opcional)
                </label>
                <input
                  type="url"
                  value={formData.media_url}
                  onChange={(e) => setFormData({ ...formData, media_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Orden de prioridad
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.order_priority}
                  onChange={(e) => setFormData({ ...formData, order_priority: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active_response"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="is_active_response" className="ml-2 text-sm text-gray-700">
                Respuesta activa
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {editingResponse ? 'Actualizar' : 'Crear'} Respuesta
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
