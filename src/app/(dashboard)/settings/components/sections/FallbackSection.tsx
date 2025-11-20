/**
 * Sección de configuración de Fallback y Derivación
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

export function FallbackSection({ configs, onReload }: Props) {
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

      // Manejar checkbox manualmente
      const checkbox = e.currentTarget.querySelector('input[name="fallback_derivation_enabled"]') as HTMLInputElement;
      if (checkbox) {
        updates.push({ 
          key: 'fallback_derivation_enabled', 
          value: checkbox.checked ? 'true' : 'false' 
        });
      }

      await configRepositoryClient.updateMultiple(updates);
      await onReload();
    } catch (error) {
      console.error('Error saving fallback config:', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fallback y Derivación</CardTitle>
        <CardDescription>
          Configura cuándo derivar conversaciones a asesores humanos
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="max_fallback_attempts">Intentos de fallback máximos antes de derivar</Label>
            <Input
              id="max_fallback_attempts"
              name="max_fallback_attempts"
              type="number"
              min="1"
              max="10"
              defaultValue={getConfigValue('max_fallback_attempts')}
              className="w-32"
              disabled={saving}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              name="fallback_derivation_enabled"
              id="fallback_derivation_enabled"
              defaultChecked={isConfigChecked('fallback_derivation_enabled')}
              disabled={saving}
            />
            <Label htmlFor="fallback_derivation_enabled" className="text-sm font-normal cursor-pointer">
              Derivar a asesor después de fallbacks
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
