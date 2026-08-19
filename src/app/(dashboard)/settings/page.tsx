/**
 * Página de Configuración del Bot
 * Solo accesible para super_admin
 */

'use client';

import { useSettingsConfig } from './hooks/useSettingsConfig';
import { CheckpointsSection } from './components/sections/CheckpointsSection';
import { ScoringSection } from './components/sections/ScoringSection';
import { FallbackSection } from './components/sections/FallbackSection';
import { ContactSection } from './components/sections/ContactSection';
import { BrandSection } from './components/sections/BrandSection';
import { MessagesSection } from './components/sections/MessagesSection';
import { MessagesTabsSection } from './components/MessagesTabsSection';
import { FollowupSection } from './components/sections/FollowupSection';
import { AISection } from './components/sections/AISection';

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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración del Bot</h1>
        <p className="text-muted-foreground mt-1">
          Ajusta el comportamiento del bot sin necesidad de modificar código
        </p>
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

      {/* Configuraciones generales */}
      <BrandSection />
      <CheckpointsSection configs={configs.appointments} onReload={loadConfigs} />
      <ScoringSection configs={configs.scoring} onReload={loadConfigs} />
      <FallbackSection configs={configs.fallback} onReload={loadConfigs} />
      <ContactSection configs={configs.contact} onReload={loadConfigs} />
      <MessagesSection configs={configs.messages} onReload={loadConfigs} />

      {/* Sección de Follow-up automático */}
      <FollowupSection configs={configs} onReload={loadConfigs} />

      {/* Sección de Inteligencia Artificial */}
      <AISection configs={configs.ai} onReload={loadConfigs} />

      {/* Sección de mensajes personalizables */}
      <MessagesTabsSection configs={configs} onReload={loadConfigs} />
    </div>
  );
}
