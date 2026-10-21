/**
 * Interruptor del camino con IA. Apagado, todo mensaje lo contesta el bot normal;
 * encendido, la IA contesta a todos los contactos.
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { BotConfig, configRepositoryClient } from '@/data/repositories/config.repository.client';

interface Props {
  configs: BotConfig[];
}

export function AiConversationSection({ configs }: Props) {
  const valueOf = (key: string) => configs.find(config => config.config_key === key)?.config_value || '';
  const [enabled, setEnabled] = useState(valueOf('ai_enabled') === 'true');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      await configRepositoryClient.updateMultiple([
        { key: 'ai_enabled', value: String(enabled) },
      ]);
      setFeedback({ type: 'success', text: 'Guardado. El cambio vale desde el siguiente mensaje.' });
    } catch (error) {
      console.error('Error saving AI conversation switch:', error);
      setFeedback({ type: 'error', text: 'No se pudo guardar' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversación con IA</CardTitle>
        <CardDescription>
          El asistente con IA contesta con el contenido del negocio en lugar del bot normal.
          Si la IA falla, el bot normal contesta ese mensaje.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="ai_enabled"
              checked={enabled}
              onCheckedChange={(checked: boolean) => { setEnabled(checked === true); setFeedback(null); }}
              disabled={saving}
            />
            <Label htmlFor="ai_enabled" className="cursor-pointer">Activar conversación con IA</Label>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            Encendido, la IA contesta a todos los contactos. Apagado, los contesta el bot normal.
          </p>
        </div>

        {feedback && (
          <p className={`text-sm ${feedback.type === 'success' ? 'text-green-700' : 'text-destructive'}`}>{feedback.text}</p>
        )}
        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
