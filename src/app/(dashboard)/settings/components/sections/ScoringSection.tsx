/**
 * Sección de configuración de Lead Scoring
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

export function ScoringSection({ configs, onReload }: Props) {
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
      console.error('Error saving scoring config:', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead Scoring</CardTitle>
        <CardDescription>
          Define los puntos y umbrales de calificación de leads
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="checkpoint_points">Puntos por checkpoint</Label>
              <Input
                id="checkpoint_points"
                name="checkpoint_points"
                type="number"
                min="1"
                max="50"
                defaultValue={getConfigValue('checkpoint_points')}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="appointment_points">Puntos por cita agendada</Label>
              <Input
                id="appointment_points"
                name="appointment_points"
                type="number"
                min="1"
                max="50"
                defaultValue={getConfigValue('appointment_points')}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="auto_offer_response_points">Puntos por responder auto-offer</Label>
              <Input
                id="auto_offer_response_points"
                name="auto_offer_response_points"
                type="number"
                min="1"
                max="50"
                defaultValue={getConfigValue('auto_offer_response_points')}
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-md">
            <div className="space-y-2">
              <Label htmlFor="lead_score_cold_max">Lead COLD (0 - ?)</Label>
              <Input
                id="lead_score_cold_max"
                name="lead_score_cold_max"
                type="number"
                min="1"
                max="100"
                defaultValue={getConfigValue('lead_score_cold_max')}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">Máximo score para COLD</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead_score_warm_max">Lead WARM (? - ?)</Label>
              <Input
                id="lead_score_warm_max"
                name="lead_score_warm_max"
                type="number"
                min="1"
                max="100"
                defaultValue={getConfigValue('lead_score_warm_max')}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">Máximo score para WARM (70+ es HOT)</p>
            </div>
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
