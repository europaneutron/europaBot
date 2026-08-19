/**
 * Página para Gestionar Respuestas de una Intención
 *
 * Orquesta estado, carga y guardado. La composición de cada respuesta vive en
 * ResponseBlockList / ResponsePreview (src/components/intents/), que trabajan
 * sobre la lista de bloques derivada de la fila de bot_responses.
 */

'use client';

import { useState, useEffect } from 'react';
import { intentConfigRepositoryClient, IntentConfiguration, BotResponse } from '@/data/repositories/intent-config.repository.client';
import {
  EditorBlock,
  responseRowToBlocks,
  blocksToFragmentedResponse,
  createTextBlock,
} from '@/lib/utils/response-blocks';
import { extractVariableKeys } from '@/lib/interpolate-message';
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
  const [selectedValueKey, setSelectedValueKey] = useState('');
  const [scopeName, setScopeName] = useState<string | null>(null);

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
      setResponses(responsesData);
      const scope = (catalogBody.scopes || []).find((item: any) => item.id === intentData.scope_id);
      setScopeName(scope?.name || (intentData.scope_id ? null : 'General'));

    } catch (error) {
      console.error('Error loading data:', error);
      setMessage({ type: 'error', text: 'Error al cargar datos' });
    } finally {
      setLoading(false);
    }
  }

  function handleNewResponse() {
    setEditingResponse(null);
    setBlocks([]);
    setBlockErrors({});
    setFormError(null);
    setFormData({
      response_key: '',
      order_priority: responses.length + 1,
      is_active: true,
      variables: {}
    });
    setShowForm(true);
  }

  function handleEditResponse(response: BotResponse) {
    setEditingResponse(response);
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

  function insertCatalogValue() {
    if (!selectedValueKey) return;
    const token = `{${selectedValueKey}}`;
    setBlocks(current => {
      const textIndex = current.findIndex(block => block.type === 'text');
      if (textIndex === -1) {
        const block = createTextBlock();
        return [{ ...block, content: token }, ...current];
      }
      return current.map((block, index) => (
        index === textIndex && block.type === 'text'
          ? { ...block, content: `${block.content}${block.content ? ' ' : ''}${token}` }
          : block
      ));
    });
    setSelectedValueKey('');
  }

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
                <Label htmlFor="response_key">Response Key *</Label>
                <Input
                  id="response_key"
                  value={formData.response_key}
                  onChange={(e) => setFormData({ ...formData, response_key: e.target.value })}
                  placeholder="main_response"
                  required
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Identificador único de la respuesta (sin espacios)
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
                  <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:flex-row">
                    <Select value={selectedValueKey} onValueChange={setSelectedValueKey}>
                      <SelectTrigger className="flex-1" aria-label="Dato del catálogo">
                        <SelectValue placeholder="Enlazar un dato del catálogo" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogValues.map(value => (
                          <SelectItem key={value.id} value={value.value_key}>
                            {value.value_key} · {value.display_value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={insertCatalogValue} disabled={!selectedValueKey || saving}>
                      Enlazar dato
                    </Button>
                  </div>
                  <ResponseBlockList
                    blocks={blocks}
                    onChange={(next) => {
                      setBlocks(next);
                      setBlockErrors({});
                    }}
                    disabled={saving}
                    blockErrors={blockErrors}
                  />
                </div>
                {/* La vista previa acompaña el desplazamiento porque la lista de
                    bloques puede ser mas alta que la ventana. */}
                <div className="space-y-2 lg:sticky lg:top-6 lg:self-start">
                  <Label>Vista previa</Label>
                  <ResponsePreview
                    blocks={blocks}
                    variables={Object.fromEntries(catalogValues.map(value => [value.value_key, value.display_value]))}
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
