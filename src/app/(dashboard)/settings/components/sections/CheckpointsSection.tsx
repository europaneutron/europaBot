/**
 * Sección de configuración de Checkpoints y Citas
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { BotConfig, configRepositoryClient } from '@/data/repositories/config.repository.client';

interface Props {
  configs: BotConfig[];
  onReload: () => Promise<void>;
}

export function CheckpointsSection({ configs, onReload }: Props) {
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

      // Manejar inputs regulares
      formData.forEach((value, key) => {
        updates.push({ key, value: value.toString() });
      });

      // Manejar checkboxes manualmente (shadcn Checkbox no usa FormData)
      const checkbox = e.currentTarget.querySelector('input[name="appointment_auto_offer_enabled"]') as HTMLInputElement;
      if (checkbox) {
        updates.push({ 
          key: 'appointment_auto_offer_enabled', 
          value: checkbox.checked ? 'true' : 'false' 
        });
      }

      await configRepositoryClient.updateMultiple(updates);
      await onReload();
    } catch (error) {
      console.error('Error saving checkpoints config:', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checkpoints y Citas</CardTitle>
        <CardDescription>
          Configura los requisitos para agendar citas automáticamente
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="checkpoints_for_appointment">
              Checkpoints requeridos para ofrecer cita automáticamente
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="checkpoints_for_appointment"
                name="checkpoints_for_appointment"
                type="number"
                min="1"
                max={getConfigValue('max_checkpoints')}
                defaultValue={getConfigValue('checkpoints_for_appointment')}
                className="w-32"
                disabled={saving}
              />
              <span className="text-sm text-muted-foreground">
                (máximo: {getConfigValue('max_checkpoints')})
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              name="appointment_auto_offer_enabled"
              id="appointment_auto_offer_enabled"
              defaultChecked={isConfigChecked('appointment_auto_offer_enabled')}
              disabled={saving}
            />
            <Label htmlFor="appointment_auto_offer_enabled" className="text-sm font-normal cursor-pointer">
              Activar oferta automática de citas
            </Label>
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
