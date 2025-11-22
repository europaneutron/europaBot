/**
 * Sección de configuración de Follow-up automático
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Save, Clock, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/services/supabase/client';
import { ConfigsByCategory } from '../../types';

interface FollowupSectionProps {
  configs: ConfigsByCategory;
  onReload: () => Promise<void>;
}

export function FollowupSection({ configs, onReload }: FollowupSectionProps) {
  const [saving, setSaving] = useState(false);
  
  // Función helper para obtener valor de config
  const getConfigValue = (key: string): string => {
    const config = configs.followup?.find(c => c.config_key === key);
    return config?.config_value || '';
  };

  const [localConfigs, setLocalConfigs] = useState({
    followup_enabled: getConfigValue('followup_enabled') === 'true',
    followup_window_start: getConfigValue('followup_window_start') || '09:00',
    followup_window_end: getConfigValue('followup_window_end') || '18:00',
    followup_template: getConfigValue('followup_template') || '',
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      // Actualizar cada configuración
      const updates = [
        {
          config_key: 'followup_enabled',
          config_value: localConfigs.followup_enabled.toString()
        },
        {
          config_key: 'followup_window_start',
          config_value: localConfigs.followup_window_start
        },
        {
          config_key: 'followup_window_end',
          config_value: localConfigs.followup_window_end
        },
        {
          config_key: 'followup_template',
          config_value: localConfigs.followup_template
        }
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('bot_config')
          .update({ config_value: update.config_value })
          .eq('config_key', update.config_key);

        if (error) throw error;
      }

      onReload();
      alert('Configuración de follow-up guardada exitosamente');
    } catch (error) {
      console.error('Error saving followup config:', error);
      alert('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <CardTitle>Follow-up Automático</CardTitle>
        </div>
        <CardDescription>
          Sistema de recordatorios automáticos para reactivar conversaciones abandonadas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Activar/Desactivar */}
        <div className="flex items-start gap-3">
          <Checkbox
            id="followup_enabled"
            checked={localConfigs.followup_enabled}
            onCheckedChange={(checked: boolean) =>
              setLocalConfigs({ ...localConfigs, followup_enabled: checked })
            }
          />
          <div className="space-y-0.5">
            <Label htmlFor="followup_enabled" className="cursor-pointer">
              Activar follow-up automático
            </Label>
            <p className="text-sm text-muted-foreground">
              Envía recordatorios a usuarios que solicitaron asesor pero no agendaron cita
            </p>
          </div>
        </div>

        {/* Ventana horaria */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="followup_window_start">
              <Clock className="h-4 w-4 inline mr-2" />
              Hora inicio
            </Label>
            <Input
              id="followup_window_start"
              type="time"
              value={localConfigs.followup_window_start}
              onChange={(e) =>
                setLocalConfigs({ ...localConfigs, followup_window_start: e.target.value })
              }
              disabled={!localConfigs.followup_enabled}
            />
            <p className="text-xs text-muted-foreground">
              Ventana gratuita de WhatsApp
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="followup_window_end">
              <Clock className="h-4 w-4 inline mr-2" />
              Hora fin
            </Label>
            <Input
              id="followup_window_end"
              type="time"
              value={localConfigs.followup_window_end}
              onChange={(e) =>
                setLocalConfigs({ ...localConfigs, followup_window_end: e.target.value })
              }
              disabled={!localConfigs.followup_enabled}
            />
            <p className="text-xs text-muted-foreground">
              Recomendado: 9:00 AM - 6:00 PM
            </p>
          </div>
        </div>

        {/* Plantilla del mensaje */}
        <div className="space-y-2">
          <Label htmlFor="followup_template">Plantilla del mensaje</Label>
          <Textarea
            id="followup_template"
            value={localConfigs.followup_template}
            onChange={(e) =>
              setLocalConfigs({ ...localConfigs, followup_template: e.target.value })
            }
            rows={12}
            disabled={!localConfigs.followup_enabled}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Variables disponibles: <code className="bg-muted px-1 rounded">{'{{nombre}}'}</code>,{' '}
            <code className="bg-muted px-1 rounded">{'{{telefono}}'}</code>
          </p>
        </div>

        {/* Botón guardar */}
        <Button
          onClick={handleSave}
          disabled={saving || !localConfigs.followup_enabled}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </Button>
      </CardContent>
    </Card>
  );
}
