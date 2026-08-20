/**
 * El editor de una respuesta: identificador, bloques del mensaje, botones y
 * vista previa. Vivía como un `<Card>` que aparecía debajo de la lista al
 * darle a "Editar" -- un clic que no llevaba a ningún sitio nuevo, solo
 * desplegaba lo mismo que se podía tener siempre a la vista.
 *
 * Se guarda solo al presionar "Guardar": eso no cambia. Lo que cambia es que
 * ya no hace falta pedir permiso para empezar a editar.
 */

'use client';

import { useState } from 'react';
import {
  ResponseButtonsEditor,
  cleanButtons,
  type ResponseButtonDraft,
  type ButtonTarget,
  type ButtonDestination,
} from '@/components/intents/ResponseButtonsEditor';
import { BotResponse } from '@/data/repositories/intent-config.repository.client';
import {
  EditorBlock,
  blocksToFragmentedResponse,
} from '@/lib/utils/response-blocks';
import { validateFragmentedResponse } from '@/types/message-fragments.types';
import { MAX_RESPONSE_BLOCKS } from '@/lib/constants/response-composer';
import ResponseBlockList, { validateBlocks } from '@/components/intents/ResponseBlockList';
import ResponsePreview from '@/components/intents/ResponsePreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save, Trash2 } from 'lucide-react';
import type { VariableOption } from '@/components/intents/VariableTextarea';

export interface ResponseDraftValues {
  response_key: string;
  order_priority: number;
  is_active: boolean;
  variables: Record<string, unknown>;
}

interface ResponseEditorProps {
  /** `null` para una respuesta nueva. */
  response: BotResponse | null;
  initialBlocks: EditorBlock[];
  initialButtons: ResponseButtonDraft[];
  initialValues: ResponseDraftValues;
  variableOptions: VariableOption[];
  targetsByScope: Record<string, ButtonTarget[]>;
  destinations: ButtonDestination[];
  currentScopeId: string;
  /** Solo se pide cuando ya hay más de una respuesta: si no, es ruido. */
  showIdentifier: boolean;
  onSave: (payload: {
    blocks: EditorBlock[];
    buttons: ResponseButtonDraft[];
    values: ResponseDraftValues;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel?: () => void;
  saving: boolean;
  deleting: boolean;
}

export function ResponseEditor({
  response,
  initialBlocks,
  initialButtons,
  initialValues,
  variableOptions,
  targetsByScope,
  destinations,
  currentScopeId,
  showIdentifier,
  onSave,
  onDelete,
  onCancel,
  saving,
  deleting,
}: ResponseEditorProps) {
  const [blocks, setBlocks] = useState<EditorBlock[]>(initialBlocks);
  const [buttons, setButtons] = useState<ResponseButtonDraft[]>(initialButtons);
  const [values, setValues] = useState<ResponseDraftValues>(initialValues);
  const [blockErrors, setBlockErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSave() {
    if (showIdentifier && !values.response_key.trim()) {
      setFormError('Response key es requerido');
      return;
    }
    if (blocks.length === 0) {
      setFormError('La respuesta debe tener al menos un bloque');
      return;
    }
    if (blocks.length > MAX_RESPONSE_BLOCKS) {
      setFormError(`La respuesta no puede tener más de ${MAX_RESPONSE_BLOCKS} bloques`);
      return;
    }

    const errors = validateBlocks(blocks);
    if (Object.keys(errors).length > 0) {
      setBlockErrors(errors);
      setFormError('Corrige los bloques señalados antes de guardar');
      return;
    }

    const fragmentedResponse = blocksToFragmentedResponse(blocks);
    if (!validateFragmentedResponse(fragmentedResponse)) {
      setFormError('La secuencia de bloques no es válida');
      return;
    }

    setBlockErrors({});
    setFormError(null);
    await onSave({ blocks, buttons, values });
  }

  return (
    <div className="space-y-6">
      {showIdentifier && (
        <div className="space-y-2">
          <Label htmlFor={`response_key_${response?.id ?? 'new'}`}>Identificador</Label>
          <Input
            id={`response_key_${response?.id ?? 'new'}`}
            value={values.response_key}
            onChange={(e) => {
              setValues({ ...values, response_key: e.target.value });
              setFormError(null);
            }}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            Distingue esta respuesta de las demás que tiene la misma pregunta.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-2">
          <Label>Bloques del mensaje</Label>
          <p className="text-xs text-muted-foreground">
            Escribe <code>{'{'}</code> dentro del texto para enlazar un dato del catálogo.
            {variableOptions.length > 0
              ? ` Este alcance alcanza ${variableOptions.length} ${variableOptions.length === 1 ? 'dato' : 'datos'}.`
              : ' Este alcance todavía no tiene datos: créalos en Catálogo.'}
          </p>
          <ResponseBlockList
            blocks={blocks}
            onChange={(next) => {
              setBlocks(next);
              setBlockErrors({});
              setFormError(null);
            }}
            disabled={saving}
            blockErrors={blockErrors}
            variableOptions={variableOptions}
          />
          <ResponseButtonsEditor
            buttons={buttons}
            onChange={(next) => {
              setButtons(next);
              setFormError(null);
            }}
            targetsByScope={targetsByScope}
            destinations={destinations}
            currentScopeId={currentScopeId}
            disabled={saving}
          />
        </div>
        <div className="space-y-2 lg:sticky lg:top-6 lg:self-start">
          <Label>Vista previa</Label>
          <ResponsePreview
            blocks={blocks}
            variables={Object.fromEntries(variableOptions.map(option => [option.key, option.preview]))}
            buttons={cleanButtons(buttons) || []}
          />
        </div>
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <div className="flex items-center space-x-2">
        <Checkbox
          id={`is_active_${response?.id ?? 'new'}`}
          checked={values.is_active}
          onCheckedChange={(checked: boolean) => setValues({ ...values, is_active: checked })}
          disabled={saving}
        />
        <Label htmlFor={`is_active_${response?.id ?? 'new'}`} className="text-sm font-normal cursor-pointer">
          Respuesta activa
        </Label>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <div>
          {response && onDelete && (
            <Button type="button" variant="ghost" onClick={onDelete} disabled={saving || deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Eliminar
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Cancelar
            </Button>
          )}
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
