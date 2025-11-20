/**
 * Página para Gestionar Respuestas de una Intención
 */

'use client';

import { useState, useEffect } from 'react';
import { intentConfigRepositoryClient, IntentConfiguration, BotResponse } from '@/data/repositories/intent-config.repository.client';
import MediaLibrary from '@/components/admin/MediaLibrary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Plus, Edit, Trash2, Loader2, Save, Folder, X } from 'lucide-react';
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
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  
  const [formData, setFormData] = useState({
    response_key: '',
    message_text: '',
    media_url: '',
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
      
      const responsesData = await intentConfigRepositoryClient.getResponsesByIntent(intentData.intent_name);
      setResponses(responsesData);
      
    } catch (error) {
      console.error('Error loading data:', error);
      setMessage({ type: 'error', text: 'Error al cargar datos' });
    } finally {
      setLoading(false);
    }
  }

  function handleNewResponse() {
    setEditingResponse(null);
    setFormData({
      response_key: '',
      message_text: '',
      media_url: '',
      order_priority: responses.length + 1,
      is_active: true,
      variables: {}
    });
    setShowForm(true);
  }

  function handleEditResponse(response: BotResponse) {
    setEditingResponse(response);
    setFormData({
      response_key: response.response_key,
      message_text: response.message_text,
      media_url: response.media_url || '',
      order_priority: response.order_priority,
      is_active: response.is_active,
      variables: response.variables || {}
    });
    setShowForm(true);
  }

  async function handleSubmitResponse(e: React.FormEvent) {
    e.preventDefault();
    
    if (!intent) return;
    
    if (!formData.response_key.trim() || !formData.message_text.trim()) {
      setMessage({ type: 'error', text: 'Response key y mensaje son requeridos' });
      return;
    }

    try {
      setSaving(true);
      const responseData = {
        intent_name: intent.intent_name,
        response_key: formData.response_key.trim(),
        message_text: formData.message_text.trim(),
        media_url: formData.media_url.trim() || null,
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
            <Link href="/intents">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">
              Respuestas: {intent.display_name}
            </h1>
          </div>
          <p className="text-muted-foreground">
            Gestiona los mensajes que el bot enviará cuando detecte esta intención
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
                        <span className="text-sm text-muted-foreground">
                          Orden: {response.order_priority}
                        </span>
                        {!response.is_active && (
                          <Badge variant="outline">Inactiva</Badge>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap">
                        {response.message_text}
                      </p>
                      {response.media_url && (
                        <p className="text-sm text-blue-600">
                          Media: {response.media_url}
                        </p>
                      )}
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
              Configura el mensaje que el bot enviará
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitResponse} className="space-y-4">
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
                <Label htmlFor="message_text">Mensaje *</Label>
                <Textarea
                  id="message_text"
                  value={formData.message_text}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, message_text: e.target.value })}
                  placeholder="Escribe el mensaje que el bot enviará..."
                  rows={6}
                  required
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Usa \n para saltos de línea
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="media_url">Media URL (opcional)</Label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        id="media_url"
                        type="url"
                        value={formData.media_url}
                        onChange={(e) => setFormData({ ...formData, media_url: e.target.value })}
                        placeholder="https://... o selecciona"
                        disabled={saving}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowMediaLibrary(true)}
                        disabled={saving}
                      >
                        <Folder className="h-4 w-4" />
                      </Button>
                      {formData.media_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setFormData({ ...formData, media_url: '' })}
                          disabled={saving}
                          title="Limpiar"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {formData.media_url && (
                      <div className="p-2 bg-muted border rounded text-xs">
                        <p className="truncate" title={formData.media_url}>
                          {formData.media_url}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="order_priority">Orden de prioridad</Label>
                  <Input
                    id="order_priority"
                    type="number"
                    min="1"
                    value={formData.order_priority}
                    onChange={(e) => setFormData({ ...formData, order_priority: parseInt(e.target.value) })}
                    disabled={saving}
                  />
                </div>
              </div>

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
                  type="submit"
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
            </form>
          </CardContent>
        </Card>
      )}

      {/* Media Library Modal */}
      {showMediaLibrary && (
        <MediaLibrary
          onSelect={(url) => {
            setFormData({ ...formData, media_url: url });
            setShowMediaLibrary(false);
          }}
          onClose={() => setShowMediaLibrary(false)}
        />
      )}
    </div>
  );
}
