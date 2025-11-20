/**
 * Página de Configuración del Bot
 * Solo accesible para super_admin
 */

'use client';

import { SettingsIcon } from 'lucide-react';
import { useSettingsConfig } from './hooks/useSettingsConfig';
import { SettingsForm } from './components/SettingsForm';
import { MessagesTabsSection } from './components/MessagesTabsSection';

export default function SettingsPage() {
  const { configs, loading, message, loadConfigs } = useSettingsConfig();

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
          <div className="space-y-4 mt-8">
            <div className="h-32 bg-muted rounded"></div>
            <div className="h-32 bg-muted rounded"></div>
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <SettingsIcon className="h-8 w-8" />
            <h1 className="text-3xl font-bold tracking-tight">
              Configuración del Bot
            </h1>
          </div>
          <p className="text-muted-foreground">
            Ajusta el comportamiento del bot sin necesidad de modificar código
          </p>
        </div>
      </div>

      {/* Mensaje de estado */}
      {message && (
        <div className={`rounded-lg border p-4 ${
          message.type === 'success' 
            ? 'border-green-200 bg-green-50 text-green-800' 
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Formulario de configuraciones generales */}
      <SettingsForm configs={configs} onReload={loadConfigs} />

      {/* Sección de mensajes personalizables */}
      <MessagesTabsSection configs={configs} onReload={loadConfigs} />
    </div>
  );
}
