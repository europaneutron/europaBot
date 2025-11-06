/**
 * Página para Editar una Intención existente
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { intentConfigRepositoryClient, IntentConfiguration } from '@/data/repositories/intent-config.repository.client';

export default function EditIntentPage({ params }: { params: { intentId: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [formData, setFormData] = useState({
    intent_name: '',
    display_name: '',
    keywords: '',
    synonyms: '',
    typos: '',
    phrases: '',
    min_confidence: 0.8,
    priority: 50,
    is_active: true,
    is_checkpoint: true,
    response_type: 'text',
    response_template: null as string | null
  });

  useEffect(() => {
    loadIntent();
  }, [params.intentId]);

  async function loadIntent() {
    try {
      setLoading(true);
      const intent = await intentConfigRepositoryClient.getById(params.intentId);
      
      if (!intent) {
        setMessage({ type: 'error', text: 'Intención no encontrada' });
        return;
      }

      setFormData({
        intent_name: intent.intent_name,
        display_name: intent.display_name,
        keywords: intent.keywords.join(', '),
        synonyms: intent.synonyms.join(', '),
        typos: intent.typos.join(', '),
        phrases: intent.phrases.join(', '),
        min_confidence: intent.min_confidence,
        priority: intent.priority,
        is_active: intent.is_active,
        is_checkpoint: intent.is_checkpoint,
        response_type: intent.response_type,
        response_template: intent.response_template
      });
    } catch (error) {
      console.error('Error loading intent:', error);
      setMessage({ type: 'error', text: 'Error al cargar intención' });
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange(field: string, value: any) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Validaciones
    if (!formData.display_name.trim()) {
      setMessage({ type: 'error', text: 'El nombre visible es requerido' });
      return;
    }

    const keywordsArray = formData.keywords.split(',').map(k => k.trim()).filter(k => k);
    if (keywordsArray.length < 3) {
      setMessage({ type: 'error', text: 'Se requieren al menos 3 keywords' });
      return;
    }

    try {
      setSaving(true);

      const updateData = {
        display_name: formData.display_name.trim(),
        keywords: formData.keywords.split(',').map(k => k.trim()).filter(k => k),
        synonyms: formData.synonyms.split(',').map(s => s.trim()).filter(s => s),
        typos: formData.typos.split(',').map(t => t.trim()).filter(t => t),
        phrases: formData.phrases.split(',').map(p => p.trim()).filter(p => p),
        min_confidence: formData.min_confidence,
        priority: formData.priority,
        is_active: formData.is_active,
        is_checkpoint: formData.is_checkpoint,
        response_type: formData.response_type,
        response_template: formData.response_template || null
      };

      await intentConfigRepositoryClient.update(params.intentId, updateData);

      setMessage({ type: 'success', text: '✅ Intención actualizada exitosamente' });
      
      // Redirigir después de 2 segundos
      setTimeout(() => {
        router.push('/dashboard/intents');
      }, 2000);

    } catch (error) {
      console.error('Error saving intent:', error);
      setMessage({ type: 'error', text: '❌ Error al guardar intención' });
    } finally {
      setSaving(false);
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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          ✏️ Editar Intención
        </h1>
        <p className="text-gray-600">
          Modifica los patrones y configuración de la intención
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

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Información Básica */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Información Básica
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre interno (intent_name)
              </label>
              <input
                type="text"
                value={formData.intent_name}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                No se puede modificar después de crear la intención
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre visible *
              </label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => handleInputChange('display_name', e.target.value)}
                placeholder="Ej: Precio de Casas"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Patrones de Reconocimiento */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Patrones de Reconocimiento
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Keywords * (separadas por coma)
              </label>
              <textarea
                value={formData.keywords}
                onChange={(e) => handleInputChange('keywords', e.target.value)}
                placeholder="precio, costo, cuanto cuesta, valor"
                rows={3}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Mínimo 3 keywords requeridas
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sinónimos (separados por coma)
              </label>
              <textarea
                value={formData.synonyms}
                onChange={(e) => handleInputChange('synonyms', e.target.value)}
                placeholder="coste, importe, monto, tarifa"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Typos comunes (separados por coma)
              </label>
              <textarea
                value={formData.typos}
                onChange={(e) => handleInputChange('typos', e.target.value)}
                placeholder="presio, cuato, cuento"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frases completas (separadas por coma)
              </label>
              <textarea
                value={formData.phrases}
                onChange={(e) => handleInputChange('phrases', e.target.value)}
                placeholder="cuanto cuesta una casa, cual es el precio, tienen financiamiento"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Configuración Avanzada */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Configuración Avanzada
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confianza mínima (0.0 - 1.0)
                </label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={formData.min_confidence}
                  onChange={(e) => handleInputChange('min_confidence', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Actual: {(formData.min_confidence * 100).toFixed(0)}%
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prioridad (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Mayor valor = más prioritario
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-8">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_checkpoint"
                  checked={formData.is_checkpoint}
                  onChange={(e) => handleInputChange('is_checkpoint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_checkpoint" className="ml-2 text-sm text-gray-700">
                  Es checkpoint (suma al progreso del usuario)
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => handleInputChange('is_active', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                  Intención activa
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Botones de acción */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.push('/dashboard/intents')}
            disabled={saving}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}
