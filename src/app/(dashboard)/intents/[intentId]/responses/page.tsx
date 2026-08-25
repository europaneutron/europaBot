/**
 * Página para Gestionar Respuestas de una Intención
 *
 * Con una sola respuesta -- el caso normal, casi siempre -- el editor está
 * abierto de entrada: nada de listar, entrar, y darle a un lápiz para llegar
 * a lo mismo que se podía tener siempre a la vista. Con varias respuestas,
 * cada una se expande en su sitio.
 *
 * La composición de cada respuesta vive en ResponseEditor
 * (src/components/intents/), que a su vez usa ResponseBlockList /
 * ResponsePreview / ResponseButtonsEditor.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { type ResponseButtonDraft, cleanButtons } from '@/components/intents/ResponseButtonsEditor';
import { ResponseEditor, type ResponseDraftValues } from '@/components/intents/ResponseEditor';
import { intentConfigRepositoryClient, IntentConfiguration, BotResponse } from '@/data/repositories/intent-config.repository.client';
import {
  EditorBlock,
  responseRowToBlocks,
  blocksToFragmentedResponse,
} from '@/lib/utils/response-blocks';
import { qualifyScopeName, extractVariableKeys, normalizeVariableKey } from '@/lib/interpolate-message';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Trash2, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function IntentResponsesPage({ params }: { params: { intentId: string } }) {
  const [intent, setIntent] = useState<IntentConfiguration | null>(null);
  const [responses, setResponses] = useState<BotResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [catalogValues, setCatalogValues] = useState<any[]>([]);
  const [scopeName, setScopeName] = useState<string | null>(null);
  const [targetsByScope, setTargetsByScope] = useState<Record<string, any[]>>({});
  const [destinations, setDestinations] = useState<any[]>([]);
  const [descendantValues, setDescendantValues] = useState<any[]>([]);
  const [scopeNames, setScopeNames] = useState<Record<string, string>>({});

  // Con más de una respuesta, cuál está desplegada. `undefined` en la clave
  // "nueva" es la respuesta que se está por crear, si se pidió.
  const [expanded, setExpanded] = useState<string | 'new' | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setDescendantValues(
        (catalogBody.values || []).filter((value: any) => value.scope_id !== intentData.scope_id)
      );
      setScopeNames(Object.fromEntries(
        (catalogBody.scopes || []).map((scope: any) => [scope.id, scope.name])
      ));
      setResponses(responsesData);
      const scope = (catalogBody.scopes || []).find((item: any) => item.id === intentData.scope_id);
      setScopeName(scope?.name || (intentData.scope_id ? null : 'General'));

      // Con una sola respuesta -- el caso normal -- se abre directo.
      setExpanded(responsesData.length === 1 ? responsesData[0].id : null);

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
      qualifiedKey: undefined as string | undefined,
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
          qualifiedKey: `${qualifyScopeName(scopeName)}.${value.value_key}`,
        };
      });
    // El identificador de duplicado es la llave calificada cuando la hay: dos
    // hijos con el mismo nombre de dato ("precio" en Europa y en Malasia) no
    // son el mismo dato, y deduplicar por la llave a secas se comia uno de
    // los dos sin avisar.
    const seen = new Set<string>();
    return [...own, ...fromChildren].filter(option => {
      const identity = option.qualifiedKey || option.key;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }, [catalogValues, descendantValues, scopeNames, intent?.scope_id]);

  // Lo que de verdad se puede rellenar: los datos propios/heredados resuelven
  // a secas, y los de un hijo (no alcanzable por herencia) solo resuelven
  // calificados -- "escribir la llave calificada" es justo lo que oferce el
  // autocompletado, asi que lo que aqui se acepta tiene que ser lo mismo.
  const availableKeys = useMemo(() => {
    const available = new Set<string>();
    for (const option of variableOptions) {
      if (option.reachable === false) {
        if (option.qualifiedKey) available.add(normalizeVariableKey(option.qualifiedKey));
      } else {
        available.add(normalizeVariableKey(option.key));
      }
    }
    return available;
  }, [variableOptions]);

  function isIncomplete(response: BotResponse): boolean {
    const keys = extractVariableKeys(describeResponse(response));
    return keys.some(key => !availableKeys.has(key));
  }

  async function handleSave(
    existing: BotResponse | null,
    payload: { blocks: EditorBlock[]; buttons: ResponseButtonDraft[]; values: ResponseDraftValues }
  ) {
    if (!intent) return;

    try {
      setSaving(true);

      const responseData = {
        intent_id: intent.id,
        response_key: payload.values.response_key.trim(),
        message_text: blocksToFragmentedResponse(payload.blocks),
        media_url: null,
        response_type: 'fragmented',
        order_priority: payload.values.order_priority,
        is_active: payload.values.is_active,
        buttons: cleanButtons(payload.buttons),
        variables: payload.values.variables,
      };

      if (existing) {
        await intentConfigRepositoryClient.updateResponse(existing.id, responseData);
        setMessage({ type: 'success', text: 'Respuesta actualizada' });
      } else {
        await intentConfigRepositoryClient.createResponse(responseData);
        setMessage({ type: 'success', text: 'Respuesta creada' });
      }

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
      setExpanded(null);
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

  const isNewOnly = responses.length === 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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
            {' '}Esto es lo que el bot manda cuando detecta esta pregunta en este alcance
          </p>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg border p-4 ${
          message.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Sin ninguna respuesta: el editor de la primera, directo. Pedir que
          se le de a "Agregar" antes de poder escribir es un clic que no
          lleva a ningún sitio nuevo. */}
      {isNewOnly && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva respuesta</CardTitle>
            <CardDescription>Nadie contesta esto todavía en este alcance.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponseEditor
              response={null}
              initialBlocks={[]}
              initialButtons={[]}
              initialValues={{
                response_key: nextResponseKey(),
                order_priority: 1,
                is_active: true,
                variables: {},
              }}
              variableOptions={variableOptions}
              targetsByScope={targetsByScope}
              destinations={destinations}
              currentScopeId={intent.scope_id || '00000000-0000-4000-8000-000000000001'}
              showIdentifier={false}
              onSave={(payload) => handleSave(null, payload)}
              saving={saving}
              deleting={false}
            />
          </CardContent>
        </Card>
      )}

      {/* Una sola respuesta: su editor, abierto de entrada. */}
      {responses.length === 1 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">Respuesta</CardTitle>
              {!responses[0].is_active && <Badge variant="outline">Inactiva</Badge>}
              {isIncomplete(responses[0]) && <Badge variant="destructive">Incompleta</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <ResponseEditor
              response={responses[0]}
              initialBlocks={responseRowToBlocks(responses[0])}
              initialButtons={responses[0].buttons || []}
              initialValues={{
                response_key: responses[0].response_key,
                order_priority: responses[0].order_priority,
                is_active: responses[0].is_active,
                variables: responses[0].variables || {},
              }}
              variableOptions={variableOptions}
              targetsByScope={targetsByScope}
              destinations={destinations}
              currentScopeId={intent.scope_id || '00000000-0000-4000-8000-000000000001'}
              showIdentifier={false}
              onSave={(payload) => handleSave(responses[0], payload)}
              onDelete={() => handleDeleteResponse(responses[0].id)}
              saving={saving}
              deleting={deleting === responses[0].id}
            />
          </CardContent>
        </Card>
      )}

      {/* Varias respuestas: caso poco común -- distintos escenarios para la
          misma pregunta. Una lista donde cada fila se despliega en su
          sitio, sin saltar a otra sección. */}
      {responses.length > 1 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Respuestas configuradas</CardTitle>
                <CardDescription>{responses.length} respuestas para esta pregunta</CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => setExpanded(expanded === 'new' ? null : 'new')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar otra
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {expanded === 'new' && (
              <div className="rounded-lg border p-4">
                <ResponseEditor
                  response={null}
                  initialBlocks={[]}
                  initialButtons={[]}
                  initialValues={{
                    response_key: nextResponseKey(),
                    order_priority: responses.length + 1,
                    is_active: true,
                    variables: {},
                  }}
                  variableOptions={variableOptions}
                  targetsByScope={targetsByScope}
                  destinations={destinations}
                  currentScopeId={intent.scope_id || '00000000-0000-4000-8000-000000000001'}
                  showIdentifier
                  onSave={(payload) => handleSave(null, payload)}
                  onCancel={() => setExpanded(null)}
                  saving={saving}
                  deleting={false}
                />
              </div>
            )}

            {responses.map((response) => {
              const isOpen = expanded === response.id;
              return (
                <div key={response.id} className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : response.id)}
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">{response.response_key}</Badge>
                        <Badge variant="outline">
                          {response.origin === 'compiler' ? 'Propuesta compilada' : 'Escrita a mano'}
                        </Badge>
                        {!response.is_active && <Badge variant="outline">Inactiva</Badge>}
                        {isIncomplete(response) && <Badge variant="destructive">Incompleta</Badge>}
                        {response.review_signals?.map(signal => (
                          <Badge key={signal} variant="destructive">{signal}</Badge>
                        ))}
                      </div>
                      {!isOpen && (
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {describeResponse(response)}
                        </p>
                      )}
                    </div>
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="border-t p-4">
                      <ResponseEditor
                        response={response}
                        initialBlocks={responseRowToBlocks(response)}
                        initialButtons={response.buttons || []}
                        initialValues={{
                          response_key: response.response_key,
                          order_priority: response.order_priority,
                          is_active: response.is_active,
                          variables: response.variables || {},
                        }}
                        variableOptions={variableOptions}
                        targetsByScope={targetsByScope}
                        destinations={destinations}
                        currentScopeId={intent.scope_id || '00000000-0000-4000-8000-000000000001'}
                        showIdentifier
                        onSave={(payload) => handleSave(response, payload)}
                        onDelete={() => handleDeleteResponse(response.id)}
                        onCancel={() => setExpanded(null)}
                        saving={saving}
                        deleting={deleting === response.id}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
