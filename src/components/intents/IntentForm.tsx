/**
 * Componente de formulario reutilizable para crear/editar intenciones
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { intentConfigRepositoryClient } from '@/data/repositories/intent-config.repository.client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Save, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';

const brandFetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
};

interface IntentFormProps {
  mode: 'create' | 'edit';
  intentId?: string;
}

interface FormData {
  intent_name: string;
  display_name: string;
  description: string;
  keywords: string;
  synonyms: string;
  typos: string;
  phrases: string;
  min_confidence: number;
  priority: number;
  is_active: boolean;
  is_checkpoint: boolean;
  is_strong_signal: boolean;
  response_type: string;
  response_template: string | null;
}

export default function IntentForm({ mode, intentId }: IntentFormProps) {
  const router = useRouter();
  const { data: brandData } = useSWR('/api/client-brand', brandFetcher);
  const projectSingular = brandData?.vocabulary?.singular || 'desarrollo';
  const projectPlural = brandData?.vocabulary?.plural || 'desarrollos';
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    intent_name: '',
    display_name: '',
    description: '',
    keywords: '',
    synonyms: '',
    typos: '',
    phrases: '',
    min_confidence: 0.8,
    priority: 50,
    is_active: true,
    is_checkpoint: true,
    is_strong_signal: false,
    response_type: 'text',
    response_template: null
  });

  useEffect(() => {
    if (mode === 'edit' && intentId) {
      loadIntent();
    }
  }, [mode, intentId]);

  async function loadIntent() {
    try {
      setLoading(true);
      const intent = await intentConfigRepositoryClient.getById(intentId!);
      
      if (!intent) {
        setMessage({ type: 'error', text: 'Intención no encontrada' });
        return;
      }

      setFormData({
        intent_name: intent.intent_name,
        display_name: intent.display_name,
        description: '',
        keywords: intent.keywords.join(', '),
        synonyms: intent.synonyms.join(', '),
        typos: intent.typos.join(', '),
        phrases: intent.phrases.join(', '),
        min_confidence: intent.min_confidence,
        priority: intent.priority,
        is_active: intent.is_active,
        is_checkpoint: intent.is_checkpoint,
        is_strong_signal: intent.is_strong_signal,
        response_type: intent.response_type,
        response_template: intent.response_template
      });
    } catch (error) {
      console.error('Error loading intent:', error);
      setMessage({ type: 'error', text: 'Error al cargar intención' });
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange(field: string, value: any) {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Auto-generar intent_name desde display_name (solo en modo crear)
    if (mode === 'create' && field === 'display_name') {
      const intentName = value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-z0-9\s]/g, '') // Solo letras, números y espacios
        .trim()
        .replace(/\s+/g, '_'); // Espacios a guiones bajos
      
      setFormData(prev => ({ ...prev, intent_name: intentName }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Validaciones
    if (!formData.display_name.trim()) {
      setMessage({ type: 'error', text: 'El nombre visible es requerido' });
      return;
    }

    if (mode === 'create') {
      if (!formData.intent_name.trim()) {
        setMessage({ type: 'error', text: 'El nombre interno es requerido' });
        return;
      }

      // Validar formato de intent_name
      if (!/^[a-z0-9_]+$/.test(formData.intent_name)) {
        setMessage({ type: 'error', text: 'El nombre interno solo puede contener letras minúsculas, números y guiones bajos' });
        return;
      }
    }

    const keywordsArray = formData.keywords.split(',').map(k => k.trim()).filter(k => k);
    if (keywordsArray.length < 3) {
      setMessage({ type: 'error', text: 'Se requieren al menos 3 keywords' });
      return;
    }

    try {
      setSaving(true);

      const intentData = {
        display_name: formData.display_name.trim(),
        keywords: formData.keywords.split(',').map(k => k.trim()).filter(k => k),
        synonyms: formData.synonyms.split(',').map(s => s.trim()).filter(s => s),
        typos: formData.typos.split(',').map(t => t.trim()).filter(t => t),
        phrases: formData.phrases.split(',').map(p => p.trim()).filter(p => p),
        min_confidence: formData.min_confidence,
        priority: formData.priority,
        is_active: formData.is_active,
        is_checkpoint: formData.is_checkpoint,
        is_strong_signal: formData.is_strong_signal,
        response_type: formData.response_type,
        response_template: formData.response_template || null
      };

      if (mode === 'create') {
        await intentConfigRepositoryClient.create({
          intent_name: formData.intent_name.trim(),
          ...intentData
        });
        setMessage({ type: 'success', text: 'Intención creada exitosamente' });
      } else {
        await intentConfigRepositoryClient.update(intentId!, intentData);
        setMessage({ type: 'success', text: 'Intención actualizada exitosamente' });
      }
      
      // Redirigir después de 2 segundos
      setTimeout(() => {
        router.push('/intents');
      }, 2000);

    } catch (error) {
      console.error('Error saving intent:', error);
      setMessage({ 
        type: 'error', 
        text: mode === 'create' 
          ? 'Error al crear intención. Verifica que el nombre no esté duplicado.' 
          : 'Error al guardar intención'
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateWithAI() {
    if (!formData.display_name.trim()) {
      setMessage({ type: 'error', text: 'Completa primero el nombre visible' });
      return;
    }

    setGenerating(true);
    setMessage(null);

    try {
      const res = await fetch('/api/intents/generate-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: formData.display_name.trim(),
          description: formData.description.trim() || undefined
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Error al generar patrones' });
        return;
      }

      setFormData(prev => ({
        ...prev,
        keywords: data.keywords?.join(', ') || prev.keywords,
        synonyms: data.synonyms?.join(', ') || prev.synonyms,
        typos: data.typos?.join(', ') || prev.typos,
        phrases: data.phrases?.join(', ') || prev.phrases,
      }));

      setMessage({ type: 'success', text: 'Patrones generados con IA. Revisa y ajusta antes de guardar.' });
    } catch (error) {
      console.error('Error generating patterns:', error);
      setMessage({ type: 'error', text: 'Error de conexion al generar patrones' });
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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
              {mode === 'create' ? 'Nueva Intención' : 'Editar Intención'}
            </h1>
          </div>
          <p className="text-muted-foreground">
            {mode === 'create' 
              ? 'Crea una nueva intención para que el bot pueda reconocer'
              : 'Modifica los patrones y configuración de la intención'
            }
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Información Básica */}
        <Card>
          <CardHeader>
              <CardTitle>Informacion basica</CardTitle>
            <CardDescription>
              Identifica la intención con un nombre claro y único
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === 'edit' && (
              <div className="space-y-2">
                <Label htmlFor="intent_name">Identificador</Label>
                <Input
                  id="intent_name"
                  value={formData.intent_name}
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">
                  Se mantiene igual para no perder las respuestas asociadas.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="display_name">Nombre visible *</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) => handleInputChange('display_name', e.target.value)}
                placeholder={`Ej: Precio de ${projectPlural}`}
                required
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripcion (para generacion con IA)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('description', e.target.value)}
                placeholder={`Ej: Cuando el usuario pregunta por el precio o costo de ${projectPlural}`}
                rows={2}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Opcional. Si lo completas, la IA generara mejores patrones.
              </p>
            </div>

            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="intent_name_create">Identificador *</Label>
                <Input
                  id="intent_name_create"
                  value={formData.intent_name}
                  onChange={(e) => handleInputChange('intent_name', e.target.value.toLowerCase())}
                  placeholder={`precio_${projectPlural.replace(/\s+/g, '_')}`}
                  pattern="[a-z0-9_]+"
                  required
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Solo letras minúsculas, números y guiones bajos. Se genera automáticamente.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Patrones de Reconocimiento */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
            <CardTitle>Formas de preguntar</CardTitle>
                <CardDescription>
                  Define como suelen pedir esta informacion tus clientes.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateWithAI}
                disabled={generating || saving || !formData.display_name.trim()}
                title={!formData.display_name.trim() ? 'Completa primero el nombre visible' : 'Generar patrones con IA'}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {generating ? 'Generando...' : 'Generar con IA'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="keywords">Palabras principales * (separadas por coma)</Label>
              <Textarea
                id="keywords"
                value={formData.keywords}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('keywords', e.target.value)}
                placeholder={`precio, costo, cuanto cuesta este ${projectSingular}, valor`}
                rows={3}
                required
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 3 keywords requeridas
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="synonyms">Sinónimos (separados por coma)</Label>
              <Textarea
                id="synonyms"
                value={formData.synonyms}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('synonyms', e.target.value)}
                placeholder="coste, importe, monto, tarifa"
                rows={2}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="typos">Errores de escritura comunes (separados por coma)</Label>
              <Textarea
                id="typos"
                value={formData.typos}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('typos', e.target.value)}
                placeholder="presio, cuato, cuento"
                rows={2}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phrases">Frases completas (separadas por coma)</Label>
              <Textarea
                id="phrases"
                value={formData.phrases}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('phrases', e.target.value)}
                placeholder={`cuanto cuesta este ${projectSingular}, cual es el precio, tienen financiamiento`}
                rows={3}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>

        {/* Configuración Avanzada */}
        <Card>
          <CardHeader>
            <CardTitle>Comportamiento</CardTitle>
            <CardDescription>
              Ajusta el comportamiento y prioridad de la intención
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min_confidence">Coincidencia minima (0.0 - 1.0)</Label>
                <Input
                  id="min_confidence"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={formData.min_confidence}
                  onChange={(e) => handleInputChange('min_confidence', parseFloat(e.target.value))}
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  {mode === 'edit' 
                    ? `Actual: ${(formData.min_confidence * 100).toFixed(0)}%`
                    : 'Recomendado: 0.75 - 0.85'
                  }
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Prioridad (0-100)</Label>
                <Input
                  id="priority"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', parseInt(e.target.value))}
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Mayor valor = mayor prioridad en desempates
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_checkpoint"
                  checked={formData.is_checkpoint}
                  onCheckedChange={(checked: boolean) => handleInputChange('is_checkpoint', checked)}
                  disabled={saving}
                />
                <Label htmlFor="is_checkpoint" className="text-sm font-normal cursor-pointer">
                  Esta pregunta cuenta para medir el interes del cliente.
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked: boolean) => handleInputChange('is_active', checked)}
                  disabled={saving}
                />
                <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
                  Intención activa
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_strong_signal"
                  checked={formData.is_strong_signal}
                  onCheckedChange={(checked: boolean) => handleInputChange('is_strong_signal', checked)}
                  disabled={saving}
                />
                <Label htmlFor="is_strong_signal" className="text-sm font-normal cursor-pointer">
                  Señal fuerte de compra (puede adelantar la oferta de cita)
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botones de acción */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/intents')}
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
              ? (mode === 'create' ? 'Creando...' : 'Guardando...') 
              : (mode === 'create' ? 'Crear Intención' : 'Guardar Cambios')
            }
          </Button>
        </div>
      </form>
    </div>
  );
}
