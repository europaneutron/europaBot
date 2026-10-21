/**
 * Persona del asistente con IA: campos guiados y notas libres. La vista previa
 * muestra el texto exacto que el modelo recibe, armado en el servidor con la misma
 * función que arma el prompt.
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, TriangleAlert } from 'lucide-react';
import { BotConfig, configRepositoryClient } from '@/data/repositories/config.repository.client';
import {
  PERSONA_CONFIG_KEYS, PERSONA_EMOJIS, PERSONA_LENGTHS, PERSONA_NAME_MAX_LENGTH, PERSONA_NOTES_MAX_LENGTH,
  PERSONA_REGISTERS, findPersonaProhibitions, type PersonaFields,
} from '@/lib/ai-persona';

interface Props {
  configs: BotConfig[];
}

const REGISTER_LABELS: Record<PersonaFields['register'], string> = { tu: 'Tú', usted: 'Usted' };
const EMOJI_LABELS: Record<PersonaFields['emojis'], string> = { si: 'Sí', pocos: 'Pocos', no: 'No' };
const LENGTH_LABELS: Record<PersonaFields['length'], string> = { corta: 'Corta', media: 'Media' };

function pick<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? value as T : fallback;
}

export function PersonaSection({ configs }: Props) {
  const valueOf = (key: string) => configs.find(config => config.config_key === key)?.config_value || '';
  const [fields, setFields] = useState<PersonaFields>({
    name: valueOf(PERSONA_CONFIG_KEYS.name),
    register: pick(valueOf(PERSONA_CONFIG_KEYS.register), PERSONA_REGISTERS, 'tu'),
    emojis: pick(valueOf(PERSONA_CONFIG_KEYS.emojis), PERSONA_EMOJIS, 'pocos'),
    length: pick(valueOf(PERSONA_CONFIG_KEYS.length), PERSONA_LENGTHS, 'corta'),
    notes: valueOf(PERSONA_CONFIG_KEYS.notes),
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<{ text: string | null; error: string | null }>({ text: null, error: null });

  const prohibitions = findPersonaProhibitions(fields.notes);
  const update = <K extends keyof PersonaFields>(key: K, value: PersonaFields[K]) => {
    setFields(current => ({ ...current, [key]: value }));
    setFeedback(null);
  };

  useEffect(() => {
    const controller = new AbortController();
    // Espera a que termine de escribir para no pedir una vista previa por tecla.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/settings/ai-persona-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
          signal: controller.signal,
        });
        const data = await response.json();
        setPreview(response.ok ? { text: data.persona, error: null } : { text: null, error: data.error || 'No se pudo armar la vista previa' });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Error loading persona preview:', error);
          setPreview({ text: null, error: 'No se pudo armar la vista previa' });
        }
      }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [fields]);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      await configRepositoryClient.updateMultiple([
        { key: PERSONA_CONFIG_KEYS.name, value: fields.name.trim() },
        { key: PERSONA_CONFIG_KEYS.register, value: fields.register },
        { key: PERSONA_CONFIG_KEYS.emojis, value: fields.emojis },
        { key: PERSONA_CONFIG_KEYS.length, value: fields.length },
        { key: PERSONA_CONFIG_KEYS.notes, value: fields.notes.trim() },
      ]);
      setFeedback({ type: 'success', text: 'Persona guardada' });
    } catch (error) {
      console.error('Error saving persona:', error);
      setFeedback({ type: 'error', text: 'No se pudo guardar la persona' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Persona del asistente</CardTitle>
        <CardDescription>
          Cómo se presenta y escribe el asistente con IA. El asistente siempre admite que es el asistente del negocio si le preguntan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="persona_name">Nombre del asistente</Label>
            <Input
              id="persona_name"
              value={fields.name}
              maxLength={PERSONA_NAME_MAX_LENGTH}
              onChange={event => update('name', event.target.value)}
              placeholder="Opcional, por ejemplo: Sofía"
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="persona_register">Tratamiento</Label>
            <Select value={fields.register} onValueChange={value => update('register', value as PersonaFields['register'])} disabled={saving}>
              <SelectTrigger id="persona_register"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSONA_REGISTERS.map(option => <SelectItem key={option} value={option}>{REGISTER_LABELS[option]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="persona_emojis">Emojis</Label>
            <Select value={fields.emojis} onValueChange={value => update('emojis', value as PersonaFields['emojis'])} disabled={saving}>
              <SelectTrigger id="persona_emojis"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSONA_EMOJIS.map(option => <SelectItem key={option} value={option}>{EMOJI_LABELS[option]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="persona_length">Largo de las respuestas</Label>
            <Select value={fields.length} onValueChange={value => update('length', value as PersonaFields['length'])} disabled={saving}>
              <SelectTrigger id="persona_length"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSONA_LENGTHS.map(option => <SelectItem key={option} value={option}>{LENGTH_LABELS[option]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="persona_notes">Notas de personalidad</Label>
          <Textarea
            id="persona_notes"
            value={fields.notes}
            maxLength={PERSONA_NOTES_MAX_LENGTH}
            onChange={event => update('notes', event.target.value)}
            rows={4}
            placeholder="Ej: Cercano y entusiasta, como un asesor que conoce bien los desarrollos."
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground text-right">{fields.notes.length}/{PERSONA_NOTES_MAX_LENGTH}</p>
          {prohibitions.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Las notas incluyen {prohibitions.map(word => `"${word}"`).join(', ')}. Una prohibición suele provocar justo lo que prohíbe.
                Mejor describe lo que el asistente sí hace: en lugar de &quot;nunca uses jerga&quot;, escribe &quot;habla con palabras sencillas&quot;.
                Puedes guardar de todos modos.
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Vista previa de lo que recibe el modelo</Label>
          {preview.error ? (
            <p className="text-sm text-destructive">{preview.error}</p>
          ) : (
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">
              {preview.text ?? 'Cargando...'}
            </pre>
          )}
          <p className="text-xs text-muted-foreground">
            Es el inicio de las instrucciones del asistente; después van el catálogo y las preguntas frecuentes.
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
