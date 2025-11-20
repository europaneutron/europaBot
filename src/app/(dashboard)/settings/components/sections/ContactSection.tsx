/**
 * Sección de configuración de Horarios y Contacto
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { BotConfig, configRepositoryClient } from '@/data/repositories/config.repository.client';

interface Props {
  configs: BotConfig[];
  onReload: () => Promise<void>;
}

export function ContactSection({ configs, onReload }: Props) {
  const [saving, setSaving] = useState(false);

  function getConfigValue(key: string): string {
    return configs.find(c => c.config_key === key)?.config_value || '';
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    try {
      const formData = new FormData(e.currentTarget);
      const updates: Array<{ key: string; value: string }> = [];

      formData.forEach((value, key) => {
        updates.push({ key, value: value.toString() });
      });

      await configRepositoryClient.updateMultiple(updates);
      await onReload();
    } catch (error) {
      console.error('Error saving contact config:', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horarios y Contacto</CardTitle>
        <CardDescription>
          Información de contacto mostrada a los usuarios
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="business_hours">Horario de atención</Label>
            <Input
              id="business_hours"
              name="business_hours"
              type="text"
              defaultValue={getConfigValue('business_hours')}
              placeholder="Ej: lunes a viernes 9:00 AM - 6:00 PM"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="advisor_phone">Teléfono del asesor (notificaciones)</Label>
            <Input
              id="advisor_phone"
              name="advisor_phone"
              type="text"
              defaultValue={getConfigValue('advisor_phone')}
              placeholder="+52XXXXXXXXXX"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="advisor_email">Email del asesor</Label>
            <Input
              id="advisor_email"
              name="advisor_email"
              type="email"
              defaultValue={getConfigValue('advisor_email')}
              placeholder="asesor@europa.com"
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
