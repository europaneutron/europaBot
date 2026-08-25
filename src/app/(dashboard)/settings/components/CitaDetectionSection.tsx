/**
 * Con qué palabras reconoce el bot que alguien quiere una cita.
 *
 * "Cita" no es una pregunta más: es lo que dispara el flujo de agendamiento
 * (ver `CITA_INTENT_NAME` en `message-processor.ts`). Por eso ya no vive en
 * /intents, donde cualquiera podía archivarla o borrarla en grupo pensando
 * que era contenido cualquiera -- justo lo que pasó una vez. Aquí, junto al
 * mensaje del flujo, queda claro que las dos cosas son la misma función.
 *
 * El botón de "Agendar visita" en los demás mensajes no depende de esta
 * fila -- es una entrada fija en `/api/intents/targets` -- así que aunque
 * esta detección se desactive, ese botón sigue abriendo el flujo. Lo único
 * que se pierde sin esta fila es que un lead que *escribe* "quiero una cita"
 * deje de ser reconocido.
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Sparkles } from 'lucide-react';
import {
  intentConfigRepositoryClient,
  IntentConfiguration,
} from '@/data/repositories/intent-config.repository.client';

const CITA_INTENT_NAME = 'cita';
const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';

/** Las mismas con las que se sembró la primera vez, por si hay que recrearla. */
const DEFAULT_KEYWORDS = ['cita', 'visita', 'agendar', 'visitar', 'conocer', 'ver'];

interface Draft {
  keywords: string;
  synonyms: string;
  typos: string;
  phrases: string;
  min_confidence: number;
}

function toDraft(row: IntentConfiguration): Draft {
  return {
    keywords: row.keywords.join(', '),
    synonyms: row.synonyms.join(', '),
    typos: row.typos.join(', '),
    phrases: row.phrases.join(', '),
    min_confidence: row.min_confidence,
  };
}

export function CitaDetectionSection() {
  const [row, setRow] = useState<IntentConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const rows = await intentConfigRepositoryClient.getByIntentName(CITA_INTENT_NAME);
      const found = rows.find(candidate => candidate.scope_id === ROOT_SCOPE_ID) || rows[0] || null;
      setRow(found);
      setDraft(found ? toDraft(found) : null);
    } catch (error) {
      console.error('Error loading cita detection:', error);
      setMessage({ type: 'error', text: 'No fue posible cargar la detección de citas' });
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setMessage(null);
    try {
      const created = await intentConfigRepositoryClient.create({
        intent_name: CITA_INTENT_NAME,
        scope_id: ROOT_SCOPE_ID,
        display_name: 'Agendar cita',
        keywords: DEFAULT_KEYWORDS,
        synonyms: [],
        typos: [],
        phrases: [],
        min_confidence: 0.7,
        priority: 90,
        response_template: null,
        response_type: 'text',
        is_active: true,
        is_checkpoint: false,
        is_strong_signal: true,
      });
      setRow(created);
      setDraft(toDraft(created));
      setMessage({ type: 'success', text: 'Detección de citas creada' });
    } catch (error) {
      console.error('Error creating cita detection:', error);
      setMessage({ type: 'error', text: 'No fue posible crearla' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!row || !draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const keywords = draft.keywords.split(',').map(value => value.trim()).filter(Boolean);
      if (keywords.length < 3) {
        setMessage({ type: 'error', text: 'Se requieren al menos 3 palabras clave' });
        return;
      }
      await intentConfigRepositoryClient.update(row.id, {
        keywords,
        synonyms: draft.synonyms.split(',').map(value => value.trim()).filter(Boolean),
        typos: draft.typos.split(',').map(value => value.trim()).filter(Boolean),
        phrases: draft.phrases.split(',').map(value => value.trim()).filter(Boolean),
        min_confidence: draft.min_confidence,
      });
      setMessage({ type: 'success', text: 'Detección de citas guardada' });
      await load();
    } catch (error) {
      console.error('Error saving cita detection:', error);
      setMessage({ type: 'error', text: 'No fue posible guardar' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detección de citas</CardTitle>
        <CardDescription>
          Con qué palabras reconoce el bot que alguien pide una cita por texto libre. El botón
          &quot;Agendar visita&quot; que se ofrece en otras respuestas no depende de esto: solo
          afecta a quien lo escribe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              message.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </div>
        ) : !row || !draft ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              No hay ninguna detección de citas activa: un lead que escriba &quot;quiero una
              cita&quot; no será reconocido hasta que se cree.
            </p>
            <Button type="button" onClick={handleRestore} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Crear detección de citas
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="cita-keywords">Palabras principales * (separadas por coma)</Label>
              <Textarea
                id="cita-keywords"
                rows={2}
                value={draft.keywords}
                onChange={event => setDraft({ ...draft, keywords: event.target.value })}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cita-synonyms">Sinónimos (separados por coma)</Label>
              <Textarea
                id="cita-synonyms"
                rows={2}
                value={draft.synonyms}
                onChange={event => setDraft({ ...draft, synonyms: event.target.value })}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cita-typos">Errores de escritura comunes (separados por coma)</Label>
              <Textarea
                id="cita-typos"
                rows={2}
                value={draft.typos}
                onChange={event => setDraft({ ...draft, typos: event.target.value })}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cita-phrases">Frases completas (separadas por coma)</Label>
              <Textarea
                id="cita-phrases"
                rows={2}
                value={draft.phrases}
                onChange={event => setDraft({ ...draft, phrases: event.target.value })}
                disabled={busy}
              />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={handleSave} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar detección de citas
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
