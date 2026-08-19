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

      // Manejar checkboxes manualmente primero
      const typingCheckbox = e.currentTarget.querySelector('input[name="typing_indicator_enabled"]') as HTMLInputElement;
      if (typingCheckbox) {
        updates.push({ 
          key: 'typing_indicator_enabled', 
          value: typingCheckbox.checked ? 'true' : 'false' 
        });
      }

      // Manejar textareas (excluir checkboxes ya procesados)
      formData.forEach((value, key) => {
        if (key !== 'typing_indicator_enabled') {
          updates.push({ key, value: value.toString() });
        }
      });

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

          {/* El mensaje de bienvenida se retiro: ningun codigo lo leia. Quien
              saluda es la pregunta `saludo`, como cualquier otra. */}

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
