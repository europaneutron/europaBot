/**
 * Sección de configuración de Mensajes del Bot
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { BotConfig, configRepositoryClient } from '@/data/repositories/config.repository.client';

interface Props {
  configs: BotConfig[];
  onReload: () => Promise<void>;
}

export function MessagesSection({ configs, onReload }: Props) {
  const [saving, setSaving] = useState(false);

  function getConfigValue(key: string): string {
    return configs.find(c => c.config_key === key)?.config_value || '';
  }

  function isConfigChecked(key: string): boolean {
    return getConfigValue(key) === 'true';
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    try {
      const formData = new FormData(e.currentTarget);
      const updates: Array<{ key: string; value: string }> = [];

      // Manejar textareas
      formData.forEach((value, key) => {
        updates.push({ key, value: value.toString() });
      });

      // Manejar checkboxes manualmente
      const typingCheckbox = e.currentTarget.querySelector('input[name="typing_indicator_enabled"]') as HTMLInputElement;
      if (typingCheckbox) {
        updates.push({ 
          key: 'typing_indicator_enabled', 
          value: typingCheckbox.checked ? 'true' : 'false' 
        });
      }

      const welcomeCheckbox = e.currentTarget.querySelector('input[name="welcome_message_enabled"]') as HTMLInputElement;
      if (welcomeCheckbox) {
        updates.push({ 
          key: 'welcome_message_enabled', 
          value: welcomeCheckbox.checked ? 'true' : 'false' 
        });
      }

      await configRepositoryClient.updateMultiple(updates);
      await onReload();
    } catch (error) {
      console.error('Error saving messages config:', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mensajes del Bot</CardTitle>
        <CardDescription>
          Configura los mensajes automáticos y características de WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              name="typing_indicator_enabled"
              id="typing_indicator_enabled"
              defaultChecked={isConfigChecked('typing_indicator_enabled')}
              disabled={saving}
            />
            <Label htmlFor="typing_indicator_enabled" className="text-sm font-normal cursor-pointer">
              Mostrar indicador de "escribiendo..." en WhatsApp
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              name="welcome_message_enabled"
              id="welcome_message_enabled"
              defaultChecked={isConfigChecked('welcome_message_enabled')}
              disabled={saving}
            />
            <Label htmlFor="welcome_message_enabled" className="text-sm font-normal cursor-pointer">
              Enviar mensaje de bienvenida a nuevos usuarios
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcome_message">Mensaje de bienvenida</Label>
            <Textarea
              id="welcome_message"
              name="welcome_message"
              rows={3}
              defaultValue={getConfigValue('welcome_message')}
              disabled={saving}
            />
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
