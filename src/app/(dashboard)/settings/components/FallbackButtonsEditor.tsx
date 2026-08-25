/**
 * Los botones de un mensaje de fallback, con el mismo editor que usa
 * cualquier respuesta escrita a mano.
 *
 * Un mensaje de fallback no vive en `bot_responses` -- es texto plano en
 * `bot_config`, ver `fallback-handler.ts` -- así que sus botones tampoco
 * pueden vivir ahí. Se guardan en una fila de configuración aparte, con la
 * misma forma exacta que `bot_responses.buttons`
 * ([{"label","intentName","scopeId","description"}]), para que
 * `authoredButtonsToOfferOptions` los lea sin distinguir de dónde vinieron.
 *
 * El destino es siempre el alcance raíz: un fallback no tiene un alcance
 * propio como una respuesta -- ver `fallbackHandler.handle(userId,
 * messageText, scopeId)`, que usa el foco de la conversación al momento de
 * mandarlo, no algo que se decida aquí.
 */

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  ResponseButtonsEditor,
  cleanButtons,
  type ResponseButtonDraft,
  type ButtonTarget,
  type ButtonDestination,
} from '@/components/intents/ResponseButtonsEditor';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { configRepositoryClient, BotConfig } from '@/data/repositories/config.repository.client';

const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';

interface TargetsResponse {
  destinations: ButtonDestination[];
  targetsByScope: Record<string, ButtonTarget[]>;
}

/**
 * La API manda `displayName`; `ResponseButtonsEditor` espera `label`. La
 * pantalla de respuestas normales ya hace este mismo cambio justo despues
 * del fetch -- ver `intents/[intentId]/responses/page.tsx` -- y aqui hacia
 * falta igual: sin el, `target.label` llegaba `undefined` y agregar un boton
 * tronaba al intentar recortarlo.
 */
async function fetchTargets(url: string): Promise<TargetsResponse | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const body = await response.json();
  return {
    destinations: body.destinations || [],
    targetsByScope: Object.fromEntries(
      Object.entries(body.targetsByScope || {}).map(([scope, list]) => [
        scope,
        (list as any[]).map(target => ({
          intentName: target.intentName,
          label: target.displayName,
          inheritedFrom: target.inheritedFrom,
          hasResponse: target.hasResponse,
        })),
      ])
    ),
  };
}

function parseButtons(value: string): ResponseButtonDraft[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface Props {
  /** La fila en `bot_config` que guarda estos botones (config_type 'json'). */
  config: BotConfig;
  label: string;
  onSaved: () => Promise<void>;
}

export function FallbackButtonsEditor({ config, label, onSaved }: Props) {
  // Compartido entre las tres instancias (una por nivel): mismo scopeId, así
  // que useSWR pide los destinos una sola vez, no tres.
  const { data: targets } = useSWR(
    `/api/intents/targets?scopeId=${ROOT_SCOPE_ID}`,
    fetchTargets
  );

  const [buttons, setButtons] = useState<ResponseButtonDraft[]>(() => parseButtons(config.config_value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await configRepositoryClient.updateMultiple([
        { key: config.config_key, value: JSON.stringify(cleanButtons(buttons) || []) },
      ]);
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error(`Error saving ${config.config_key}:`, error);
    } finally {
      setSaving(false);
    }
  }

  if (!targets) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Cargando opciones...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ResponseButtonsEditor
        buttons={buttons}
        onChange={setButtons}
        targetsByScope={targets.targetsByScope}
        destinations={targets.destinations}
        currentScopeId={ROOT_SCOPE_ID}
        disabled={saving}
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Save className="h-3 w-3 mr-2" />}
          Guardar {label}
        </Button>
        {saved && <span className="text-xs text-green-700">Guardado</span>}
      </div>
    </div>
  );
}
