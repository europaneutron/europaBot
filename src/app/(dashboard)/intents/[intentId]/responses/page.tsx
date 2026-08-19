/**
 * Página para Gestionar Respuestas de una Intención
 *
 * Orquesta estado, carga y guardado. La composición de cada respuesta vive en
 * ResponseBlockList / ResponsePreview (src/components/intents/), que trabajan
 * sobre la lista de bloques derivada de la fila de bot_responses.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ResponseButtonsEditor,
  cleanButtons,
  type ResponseButtonDraft,
  type ButtonTarget,
  type ButtonDestination,
} from '@/components/intents/ResponseButtonsEditor';
import { intentConfigRepositoryClient, IntentConfiguration, BotResponse } from '@/data/repositories/intent-config.repository.client';
import {
  EditorBlock,
  responseRowToBlocks,
  blocksToFragmentedResponse,
  createTextBlock,
} from '@/lib/utils/response-blocks';
import { qualifyScopeName, extractVariableKeys } from '@/lib/interpolate-message';
import { validateFragmentedResponse } from '@/types/message-fragments.types';
import { MAX_RESPONSE_BLOCKS } from '@/lib/constants/response-composer';
import ResponseBlockList, { validateBlocks } from '@/components/intents/ResponseBlockList';
import ResponsePreview from '@/components/intents/ResponsePreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Plus, Edit, Trash2, Loader2, Save } from 'lucide-react';
import Link from 'next/link';

export default function IntentResponsesPage({ params }: { params: { intentId: string } }) {
  const [intent, setIntent] = useState<IntentConfiguration | null>(null);
  const [responses, setResponses] = useState<BotResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingResponse, setEditingResponse] = useState<BotResponse | null>(null);
  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [blockErrors, setBlockErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [catalogValues, setCatalogValues] = useState<any[]>([]);
  const [scopeName, setScopeName] = useState<string | null>(null);
  const [buttons, setButtons] = useState<ResponseButtonDraft[]>([]);
  const [targetsByScope, setTargetsByScope] = useState<Record<string, ButtonTarget[]>>({});
  const [destinations, setDestinations] = useState<ButtonDestination[]>([]);
  const [descendantValues, setDescendantValues] = useState<any[]>([]);
  const [scopeNames, setScopeNames] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    response_key: '',
    order_priority: 1,
    is_active: true,
    variables: {}
  });

  useEffect(() => {
    loadData();
  }, [params.intentId]);

  async function loadData() {
    try {
      setLoading(true);

      const intentData = await intentConfigRepositoryClient.getById(params.intentId);
      if (!intentData) {
        setMessage({ type: 'error', text: 'Intención no encontrada' });
        return;
      }

      setIntent(intentData);
      const catalogPromise = fetch(`/api/catalog-values?scopeId=${encodeURIComponent(intentData.scope_id || '00000000-0000-4000-8000-000000000001')}`);
      const responsesPromise = intentConfigRepositoryClient.getResponsesByIntentId(intentData.id);
      const [catalogResponse, responsesData] = await Promise.all([catalogPromise, responsesPromise]);
      const catalogBody = await catalogResponse.json();
      if (!catalogResponse.ok) throw new Error(catalogBody.error || 'No fue posible cargar el catálogo');
      setCatalogValues(catalogBody.resolvedValues || []);
      // `values` es el arbol: este alcance y todo lo que cuelga de el.
      setDescendantValues(
        (catalogBody.values || []).filter((value: any) => value.scope_id !== intentData.scope_id)
      );
      setScopeNames(Object.fromEntries(
        (catalogBody.scopes || []).map((scope: any) => [scope.id, scope.name])
      ));
      setResponses(responsesData);
      const scope = (catalogBody.scopes || []).find((item: any) => item.id === intentData.scope_id);
      setScopeName(scope?.name || (intentData.scope_id ? null : 'General'));

      // Con que se puede encadenar. Lo decide el servidor porque depende de la
      // herencia: este alcance alcanza lo suyo y lo de sus ancestros, nunca lo
      // de un hermano. Encadenar con un hermano no da error, da otra cosa.
      const targetsResponse = await fetch(
        `/api/intents/targets?scopeId=${encodeURIComponent(intentData.scope_id || '')}`
        + `&exclude=${encodeURIComponent(intentData.intent_name)}`
      );
      const targetsBody = await targetsResponse.json();
      setTargetsByScope(Object.fromEntries(
        Object.entries(targetsBody.targetsByScope || {}).map(([scope, list]) => [
          scope,
          (list as any[]).map(target => ({
            intentName: target.intentName,
            label: target.displayName,
            inheritedFrom: target.inheritedFrom,
            hasResponse: target.hasResponse,
          })),
        ])
      ));
      setDestinations(targetsBody.destinations || []);

    } catch (error) {
      console.error('Error loading data:', error);
      setMessage({ type: 'error', text: 'Error al cargar datos' });
    } finally {
      setLoading(false);
    }
  }

  /** Una clave libre para esta pregunta: `precio`, `precio_2`, `precio_3`. */
  function nextResponseKey(): string {
    const base = intent?.intent_name || 'respuesta';
    const used = new Set(responses.map(response => response.response_key));
    if (!used.has(base)) return base;
    for (let index = 2; index < 100; index += 1) {
      const candidate = `${base}_${index}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base}_${Date.now()}`;
  }

  function handleNewResponse() {
    setEditingResponse(null);
    setButtons([]);
    setBlocks([]);
    setBlockErrors({});
    setFormError(null);
    setFormData({
      // La clave es un identificador interno, no una decision del usuario: el
      // compilador se la pone sola y a mano se la pedia a quien escribe. No
      // hay indice unico, asi que basta con derivarla de la pregunta y
      // numerar cuando ya hay otra.
      response_key: nextResponseKey(),
      order_priority: responses.length + 1,
      is_active: true,
      variables: {}
    });
    setShowForm(true);
  }

  function handleEditResponse(response: BotResponse) {
    setEditingResponse(response);
    setButtons(response.buttons || []);
    setBlocks(
      responseRowToBlocks({
        message_text: response.message_text,
        media_url: response.media_url,
        response_type: response.response_type,
      })
    );
    setBlockErrors({});
    setFormError(null);
    setFormData({
      response_key: response.response_key,
      order_priority: response.order_priority,
      is_active: response.is_active,
      variables: response.variables || {}
    });
    setShowForm(true);
  }

  // Lo que este alcance alcanza --lo suyo y lo heredado-- mas lo que vive por
  // debajo, en sus hijos, marcado como lo que es: la herencia va de hijo a
  // padre, asi que un padre no puede rellenar un hueco de su hijo. Se ensena
  // igual porque el caso es real --"precio desde" para el negocio, con los
  // precios en los desarrollos-- y la salida honesta es copiarlo aqui, no
  // escribir un hueco que nunca se llena.
  const variableOptions = useMemo(() => {
    const reachableKeys = new Set(catalogValues.map(value => value.value_key));
    const own = catalogValues.map(value => ({
      key: value.value_key,
      preview: String(value.display_value ?? value.value ?? ''),
      from: value.scope_id === intent?.scope_id ? null : (scopeNames[value.scope_id] || null),
      reachable: true,
    }));
    const fromChildren = descendantValues
      .filter(value => !reachableKeys.has(value.value_key))
      .map(value => {
        const scopeName = value.scopes?.name || scopeNames[value.scope_id] || '';
        return {
          key: value.value_key,
          preview: String(value.value ?? ''),
          from: scopeName || 'otro alcance',
          reachable: false,
          // Asi se escribe para que se resuelva desde donde sea.
          qualifiedKey: `${qualifyScopeName(scopeName)}.${value.value_key}`,
        };
      });
    // Un mismo nombre puede existir en varios hijos: se ofrece una vez.
    const seen = new Set<string>();
    return [...own, ...fromChildren].filter(option => {
      if (seen.has(option.key)) return false;
      seen.add(option.key);
      return true;
    });
  }, [catalogValues, descendantValues, scopeNames, intent?.scope_id]);

  function isIncomplete(response: BotResponse): boolean {
    const keys = extractVariableKeys(describeResponse(response));
    const available = new Set(catalogValues.map(value => value.value_key));
    return keys.some(key => !available.has(key));
  }

  async function handleSubmitResponse() {
    if (!intent) return;

    if (!formData.response_key.trim()) {
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

    try {
      setSaving(true);
      setBlockErrors({});
      setFormError(null);

      const responseData = {
        intent_id: intent.id,
        response_key: formData.response_key.trim(),
        message_text: fragmentedResponse,
        media_url: null,
        response_type: 'fragmented',
        order_priority: formData.order_priority,
        is_active: formData.is_active,
        buttons: cleanButtons(buttons),
        variables: formData.variables
      };

      if (editingResponse) {
        await intentConfigRepositoryClient.updateResponse(editingResponse.id, responseData);
        setMessage({ type: 'success', text: 'Respuesta actualizada' });
      } else {
        await intentConfigRepositoryClient.createResponse(responseData);
        setMessage({ type: 'success', text: 'Respuesta creada' });
      }

      setShowForm(false);
      await loadData();

      setTimeout(() => setMessage(null), 3000);

    } catch (error) {
      console.error('Error saving response:', error);
      setMessage({ type: 'error', text: 'Error al guardar respuesta' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteResponse(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta respuesta?')) return;

    try {
      setDeleting(id);
      await intentConfigRepositoryClient.deleteResponse(id);
      setMessage({ type: 'success', text: 'Respuesta eliminada' });
      await loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error deleting response:', error);
      setMessage({ type: 'error', text: 'Error al eliminar respuesta' });
    } finally {
      setDeleting(null);
    }
  }

  function describeResponse(response: BotResponse): string {
    const rowBlocks = responseRowToBlocks({
      message_text: response.message_text,
      media_url: response.media_url,
      response_type: response.response_type,
    });

    return rowBlocks
      .map((block) => {
        if (block.type === 'text') return block.content;
        if (block.type === 'document') return `[documento: ${block.filename}]`;
        return `[${block.type}]`;
      })
      .join(' · ');
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!intent) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Intención no encontrada
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href={`/intents/q/${encodeURIComponent(intent.intent_name)}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">
              Respuestas: {intent.display_name}
            </h1>
          </div>
          <p className="text-muted-foreground">
            Alcance: <span className="font-medium">{scopeName || 'General'}</span> ·
            {' '}Gestiona los mensajes que el bot enviará cuando detecte esta pregunta en este alcance
          </p>
        </div>
      </div>

      {/* Mensaje de estado */}
      {message && (
        <div className={`rounded-lg border p-4 ${
          message.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Lista de respuestas */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Respuestas configuradas</CardTitle>
              <CardDescription>{responses.length} respuesta{responses.length !== 1 ? 's' : ''}</CardDescription>
            </div>
            <Button onClick={handleNewResponse} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Agregar Respuesta
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {responses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay respuestas configuradas. Agrega una para comenzar.
            </div>
          ) : (
            <div className="space-y-4">
              {responses.map((response) => (
                <div key={response.id} className="p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">{response.response_key}</Badge>
                        <Badge variant="outline">
                          {response.origin === 'compiler' ? 'Propuesta compilada' : 'Escrita a mano'}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Orden: {response.order_priority}
                        </span>
                        {!response.is_active && (
                          <Badge variant="outline">Inactiva</Badge>
                        )}
                        {isIncomplete(response) ? <Badge variant="destructive">Incompleta</Badge> : null}
                        {response.review_signals?.map(signal => (
                          <Badge key={signal} variant="destructive">{signal}</Badge>
                        ))}
                      </div>
                      <p className="whitespace-pre-wrap text-sm">
                        {describeResponse(response)}
                      </p>
                      {response.response_fact_dependencies?.map((dependency, index) => {
                        const fact = dependency.compiler_facts;
                        if (!fact) return null;
                        return (
                          <a
                            key={`${fact.material_id}-${fact.page_number}-${index}`}
                            href={`/api/compiler/materials/${fact.material_id}#page=${fact.page_number}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mr-3 inline-block text-xs text-primary hover:underline"
                          >
                            {fact.fact_key}: {fact.compiler_materials?.original_filename || 'material'}, página {fact.page_number}
                          </a>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditResponse(response)}
                        disabled={saving || deleting !== null}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteResponse(response.id)}
                        disabled={saving || deleting !== null}
                      >
                        {deleting === response.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulario de creación/edición */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingResponse ? 'Editar Respuesta' : 'Nueva Respuesta'}</CardTitle>
            <CardDescription>
              Compón la secuencia de mensajes que el bot enviará
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="response_key">Identificador</Label>
                <Input
                  id="response_key"
                  value={formData.response_key}
                  onChange={(e) => {
                    setFormData({ ...formData, response_key: e.target.value });
                    setFormError(null);
                  }}
                  placeholder={intent?.intent_name || 'respuesta'}
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Se pone solo. Solo lo cambias si esta pregunta va a tener varias respuestas y
                  quieres distinguirlas.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="order_priority">Orden de prioridad</Label>
                <Input
                  id="order_priority"
                  type="number"
                  min="1"
                  className="max-w-xs"
                  value={formData.order_priority}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    // Un campo vacío o no numérico no debe escribir NaN en el estado:
                    // NaN se serializa como NULL y descoloca el ORDER BY de getBotResponses.
                    setFormData((prev) => ({
                      ...prev,
                      order_priority: Number.isNaN(parsed) ? prev.order_priority : parsed,
                    }));
                  }}
                  disabled={saving}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-2">
                  <Label>Bloques del mensaje</Label>
                  {/* Enlazar un dato se hace escribiendo `{` dentro del texto:
                      el desplegable de antes pegaba el hueco al final del
                      primer bloque, no donde estaba el cursor. */}
                  <p className="text-xs text-muted-foreground">
                    Escribe <code>{'{'}</code> dentro del texto para enlazar un dato del catálogo.
                    {catalogValues.length > 0
                      ? ` Este alcance alcanza ${catalogValues.length} ${catalogValues.length === 1 ? 'dato' : 'datos'}.`
                      : ' Este alcance todavía no tiene datos: créalos en Catálogo.'}
                  </p>
                  <ResponseBlockList
                    blocks={blocks}
                    onChange={(next) => {
                      setBlocks(next);
                      setBlockErrors({});
                      // El aviso solo se limpiaba al abrir otra respuesta, asi
                      // que se quedaba en pantalla mientras se corregia y
                      // parecia provocado por lo ultimo que se tocaba.
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
                    currentScopeId={intent?.scope_id || '00000000-0000-4000-8000-000000000001'}
                    disabled={saving}
                  />
                </div>
                {/* La vista previa acompaña el desplazamiento porque la lista de
                    bloques puede ser mas alta que la ventana. */}
                <div className="space-y-2 lg:sticky lg:top-6 lg:self-start">
                  <Label>Vista previa</Label>
                  <ResponsePreview
                    blocks={blocks}
                    variables={Object.fromEntries(catalogValues.map(value => [value.value_key, value.display_value]))}
                    buttons={cleanButtons(buttons) || []}
                  />
                </div>
              </div>

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active_response"
                  checked={formData.is_active}
                  onCheckedChange={(checked: boolean) => setFormData({ ...formData, is_active: checked })}
                  disabled={saving}
                />
                <Label htmlFor="is_active_response" className="text-sm font-normal cursor-pointer">
                  Respuesta activa
                </Label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmitResponse}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {saving
                    ? (editingResponse ? 'Actualizando...' : 'Creando...')
                    : (editingResponse ? 'Actualizar' : 'Crear')
                  }
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
