/**
 * Interruptor del camino con IA y lista de teléfonos que lo prueban.
 * Apagado, todo mensaje lo contesta el bot normal. Con lista, solo esos teléfonos
 * pasan por la IA; con la lista vacía, todos.
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save, TriangleAlert } from 'lucide-react';
import { BotConfig, configRepositoryClient } from '@/data/repositories/config.repository.client';
import { parsePhonesInput, phonesToInput } from '@/lib/ai-switch';

interface Props {
  configs: BotConfig[];
}

export function AiConversationSection({ configs }: Props) {
  const valueOf = (key: string) => configs.find(config => config.config_key === key)?.config_value || '';
  const [enabled, setEnabled] = useState(valueOf('ai_enabled') === 'true');
  const [phonesText, setPhonesText] = useState(phonesToInput(valueOf('ai_allowed_phones')));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { phones, invalid } = parsePhonesInput(phonesText);

  async function handleSave() {
    if (invalid.length > 0) {
      setFeedback({ type: 'error', text: `Estos teléfonos no son válidos: ${invalid.join(', ')}` });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await configRepositoryClient.updateMultiple([
        { key: 'ai_enabled', value: String(enabled) },
        { key: 'ai_allowed_phones', value: JSON.stringify(phones) },
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
              onCheckedChange={(checked: boolean) => setEnabled(checked === true)}
              disabled={saving}
            />
            <Label htmlFor="ai_enabled" className="cursor-pointer">Activar conversación con IA</Label>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            Apagado, todos los mensajes los contesta el bot normal.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai_allowed_phones">Teléfonos que prueban la IA</Label>
          <Textarea
            id="ai_allowed_phones"
            value={phonesText}
            onChange={event => { setPhonesText(event.target.value); setFeedback(null); }}
            placeholder={'5219991234567\n5219997654321'}
            rows={4}
            disabled={saving}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Uno por línea, con lada de país. Con teléfonos en la lista, solo ellos hablan con la IA y el resto con el bot normal.
            Con la lista vacía, la IA atiende a todos los contactos.
          </p>
          {invalid.length > 0 && (
            <p className="text-xs text-destructive">No son teléfonos válidos: {invalid.join(', ')}</p>
          )}
          {enabled && phones.length === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>La IA está activada y la lista está vacía: al guardar, atenderá a todos los contactos.</span>
            </div>
          )}
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
