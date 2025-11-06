/**
 * Página de Configuración del Bot
 * Solo accesible para super_admin
 */

'use client';

import { useState, useEffect } from 'react';
import { configRepositoryClient, BotConfig } from '@/data/repositories/config.repository.client';

interface ConfigsByCategory {
  appointments: BotConfig[];
  scoring: BotConfig[];
  fallback: BotConfig[];
  contact: BotConfig[];
  messages: BotConfig[];
}

export default function SettingsPage() {
  const [configs, setConfigs] = useState<ConfigsByCategory>({
    appointments: [],
    scoring: [],
    fallback: [],
    contact: [],
    messages: []
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Cargar configuraciones al montar
  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      setLoading(true);
      const allConfigs = await configRepositoryClient.getAll();
      
      // Agrupar por categoría
      const grouped: ConfigsByCategory = {
        appointments: allConfigs.filter((c: BotConfig) => c.category === 'appointments'),
        scoring: allConfigs.filter((c: BotConfig) => c.category === 'scoring'),
        fallback: allConfigs.filter((c: BotConfig) => c.category === 'fallback'),
        contact: allConfigs.filter((c: BotConfig) => c.category === 'contact'),
        messages: allConfigs.filter((c: BotConfig) => c.category === 'messages')
      };
      
      setConfigs(grouped);
    } catch (error) {
      console.error('Error loading configs:', error);
      setMessage({ type: 'error', text: 'Error al cargar configuraciones' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      
      // Recolectar todos los valores del formulario
      const updates: Array<{ key: string; value: string }> = [];
      
      // Leer todos los inputs del formulario
      const form = document.getElementById('config-form') as HTMLFormElement;
      const inputs = form.querySelectorAll('input, textarea');
      
      inputs.forEach((input) => {
        const el = input as HTMLInputElement | HTMLTextAreaElement;
        const key = el.name;
        let value = el.value;
        
        // Para checkboxes, convertir a string boolean
        if (el.type === 'checkbox') {
          value = (el as HTMLInputElement).checked ? 'true' : 'false';
        }
        
        if (key) {
          updates.push({ key, value });
        }
      });
      
      // Actualizar en batch
      await configRepositoryClient.updateMultiple(updates);
      
      setMessage({ type: 'success', text: '✅ Configuraciones guardadas exitosamente' });
      
      // Recargar para reflejar cambios
      await loadConfigs();
      
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setMessage(null), 3000);
      
    } catch (error) {
      console.error('Error saving configs:', error);
      setMessage({ type: 'error', text: '❌ Error al guardar configuraciones' });
    } finally {
      setSaving(false);
    }
  }

  function getConfigValue(configs: BotConfig[], key: string): string {
    return configs.find(c => c.config_key === key)?.config_value || '';
  }

  function isConfigChecked(configs: BotConfig[], key: string): boolean {
    return getConfigValue(configs, key) === 'true';
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="space-y-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          ⚙️ Configuración del Bot
        </h1>
        <p className="text-gray-600">
          Ajusta el comportamiento del bot sin necesidad de modificar código
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

      <form id="config-form" className="space-y-8">
        
        {/* Sección: Checkpoints y Citas */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">📋</span>
            Checkpoints y Citas
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Checkpoints requeridos para ofrecer cita automáticamente
              </label>
              <input
                type="number"
                name="checkpoints_for_appointment"
                min="1"
                max={getConfigValue(configs.appointments, 'max_checkpoints')}
                defaultValue={getConfigValue(configs.appointments, 'checkpoints_for_appointment')}
                className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-500">
                (máximo: {getConfigValue(configs.appointments, 'max_checkpoints')})
              </span>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="appointment_auto_offer_enabled"
                id="appointment_auto_offer_enabled"
                defaultChecked={isConfigChecked(configs.appointments, 'appointment_auto_offer_enabled')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="appointment_auto_offer_enabled" className="ml-2 text-sm text-gray-700">
                Activar oferta automática de citas
              </label>
            </div>
          </div>
        </section>

        {/* Sección: Lead Scoring */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">📊</span>
            Lead Scoring
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Puntos por checkpoint
                </label>
                <input
                  type="number"
                  name="checkpoint_points"
                  min="1"
                  max="50"
                  defaultValue={getConfigValue(configs.scoring, 'checkpoint_points')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Puntos por cita agendada
                </label>
                <input
                  type="number"
                  name="appointment_points"
                  min="1"
                  max="50"
                  defaultValue={getConfigValue(configs.scoring, 'appointment_points')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Puntos por responder auto-offer
                </label>
                <input
                  type="number"
                  name="auto_offer_response_points"
                  min="1"
                  max="50"
                  defaultValue={getConfigValue(configs.scoring, 'auto_offer_response_points')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 p-4 bg-gray-50 rounded-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lead COLD (0 - ?)
                </label>
                <input
                  type="number"
                  name="lead_score_cold_max"
                  min="1"
                  max="100"
                  defaultValue={getConfigValue(configs.scoring, 'lead_score_cold_max')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Máximo score para COLD</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lead WARM (? - ?)
                </label>
                <input
                  type="number"
                  name="lead_score_warm_max"
                  min="1"
                  max="100"
                  defaultValue={getConfigValue(configs.scoring, 'lead_score_warm_max')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Máximo score para WARM (70+ es HOT)</p>
              </div>
            </div>
          </div>
        </section>

        {/* Sección: Fallback y Derivación */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">🔄</span>
            Fallback y Derivación
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Intentos de fallback máximos antes de derivar
              </label>
              <input
                type="number"
                name="max_fallback_attempts"
                min="1"
                max="10"
                defaultValue={getConfigValue(configs.fallback, 'max_fallback_attempts')}
                className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="fallback_derivation_enabled"
                id="fallback_derivation_enabled"
                defaultChecked={isConfigChecked(configs.fallback, 'fallback_derivation_enabled')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="fallback_derivation_enabled" className="ml-2 text-sm text-gray-700">
                Derivar a asesor después de fallbacks
              </label>
            </div>
          </div>
        </section>

        {/* Sección: Horarios y Contacto */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">📞</span>
            Horarios y Contacto
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Horario de atención
              </label>
              <input
                type="text"
                name="business_hours"
                defaultValue={getConfigValue(configs.contact, 'business_hours')}
                placeholder="Ej: lunes a viernes 9:00 AM - 6:00 PM"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono del asesor (notificaciones)
              </label>
              <input
                type="text"
                name="advisor_phone"
                defaultValue={getConfigValue(configs.contact, 'advisor_phone')}
                placeholder="+52XXXXXXXXXX"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email del asesor
              </label>
              <input
                type="email"
                name="advisor_email"
                defaultValue={getConfigValue(configs.contact, 'advisor_email')}
                placeholder="asesor@europa.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Sección: Mensajes */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">💬</span>
            Mensajes del Bot
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                name="welcome_message_enabled"
                id="welcome_message_enabled"
                defaultChecked={isConfigChecked(configs.messages, 'welcome_message_enabled')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="welcome_message_enabled" className="ml-2 text-sm text-gray-700">
                Enviar mensaje de bienvenida a nuevos usuarios
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mensaje de bienvenida
              </label>
              <textarea
                name="welcome_message"
                rows={3}
                defaultValue={getConfigValue(configs.messages, 'welcome_message')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Botones de acción */}
        <div className="flex justify-end space-x-4 pt-4">
          <button
            type="button"
            onClick={loadConfigs}
            disabled={saving}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
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
