/**
 * Seccion de configuracion de Inteligencia Artificial
 * Gestiona: contexto del negocio, modelo de OpenAI, y API key (Vault)
 * La API key se guarda en Supabase Vault — nunca se muestra al usuario
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Key, Eye, EyeOff, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { BotConfig, configRepositoryClient } from '@/data/repositories/config.repository.client';

interface Props {
  configs: BotConfig[];
  onReload: () => Promise<void>;
}

interface VaultStatus {
  exists: boolean;
  last_chars?: string;
  updated_at?: string;
}

export function AISection({ configs, onReload }: Props) {
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [deletingKey, setDeletingKey] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyMessage, setKeyMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  function getConfigValue(key: string): string {
    return configs.find(c => c.config_key === key)?.config_value || '';
  }

  useEffect(() => {
    checkVaultStatus();
  }, []);

  async function checkVaultStatus() {
    try {
      const res = await fetch('/api/settings/ai-secret');
      if (res.ok) {
        const data = await res.json();
        setVaultStatus(data);
      }
    } catch (error) {
      console.error('Error checking vault status:', error);
    }
  }

  async function handleSaveConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    try {
      const formData = new FormData(e.currentTarget);
      const updates: Array<{ key: string; value: string }> = [];

      formData.forEach((value, key) => {
        updates.push({ key, value: value.toString() });
      });

      await configRepositoryClient.updateMultiple(updates);
      await onReload();
    } catch (error) {
      console.error('Error saving AI config:', error);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveKey() {
    if (!newApiKey.trim()) return;

    setSavingKey(true);
    setKeyMessage(null);

    try {
      const res = await fetch('/api/settings/ai-secret', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: newApiKey.trim() })
      });

      const data = await res.json();

      if (!res.ok) {
        setKeyMessage({ type: 'error', text: data.error || 'Error al guardar' });
        return;
      }

      setNewApiKey('');
      setShowKeyInput(false);
      setKeyMessage({ type: 'success', text: 'API key guardada en Vault' });
      await checkVaultStatus();
      setTimeout(() => setKeyMessage(null), 4000);
    } catch (error) {
      console.error('Error saving API key:', error);
      setKeyMessage({ type: 'error', text: 'Error de conexion' });
    } finally {
      setSavingKey(false);
    }
  }

  async function handleDeleteKey() {
    setDeletingKey(true);
    setKeyMessage(null);

    try {
      const res = await fetch('/api/settings/ai-secret', { method: 'DELETE' });

      if (!res.ok) {
        setKeyMessage({ type: 'error', text: 'Error al eliminar' });
        return;
      }

      setVaultStatus({ exists: false });
      setKeyMessage({ type: 'success', text: 'API key eliminada' });
      setTimeout(() => setKeyMessage(null), 4000);
    } catch (error) {
      console.error('Error deleting API key:', error);
      setKeyMessage({ type: 'error', text: 'Error de conexion' });
    } finally {
      setDeletingKey(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* API Key (Vault) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Key de OpenAI
          </CardTitle>
          <CardDescription>
            La clave se almacena encriptada en Supabase Vault. No se puede ver ni copiar una vez guardada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Estado actual */}
          <div className="flex items-center gap-3">
            {vaultStatus === null ? (
              <span className="text-sm text-muted-foreground">Verificando...</span>
            ) : vaultStatus.exists ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700">
                  Clave configurada
                </span>
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                  ••••••••{vaultStatus.last_chars}
                </code>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-600">
                  Sin clave configurada
                </span>
              </div>
            )}
          </div>

          {/* Mensaje de estado */}
          {keyMessage && (
            <div className={`rounded-lg border p-3 text-sm ${
              keyMessage.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}>
              {keyMessage.text}
            </div>
          )}

          {/* Input para nueva key */}
          {showKeyInput ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="api_key">
                  {vaultStatus?.exists ? 'Nueva API key (reemplaza la actual)' : 'API key de OpenAI'}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="api_key"
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="sk-..."
                    autoComplete="off"
                    disabled={savingKey}
                    className="font-mono"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  La clave se encripta y nunca se vuelve a mostrar.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleSaveKey}
                  disabled={savingKey || !newApiKey.trim()}
                  size="sm"
                >
                  {savingKey ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {savingKey ? 'Guardando...' : 'Guardar en Vault'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowKeyInput(false); setNewApiKey(''); }}
                  disabled={savingKey}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowKeyInput(true)}
              >
                <Key className="h-4 w-4 mr-2" />
                {vaultStatus?.exists ? 'Cambiar clave' : 'Configurar clave'}
              </Button>
              {vaultStatus?.exists && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteKey}
                  disabled={deletingKey}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {deletingKey ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Eliminar
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contexto del Negocio */}
      <Card>
        <CardHeader>
          <CardTitle>Contexto del Negocio</CardTitle>
          <CardDescription>
            Esta descripcion se usa como contexto cuando la IA genera patrones para nuevas intenciones.
            Describe tu negocio, productos, y el tipo de preguntas que reciben.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveConfig} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="ai_business_context">Descripcion del negocio</Label>
              <Textarea
                id="ai_business_context"
                name="ai_business_context"
                defaultValue={getConfigValue('ai_business_context')}
                placeholder="Ej: Somos una inmobiliaria que vende casas y terrenos en la zona metropolitana. Los clientes preguntan frecuentemente por precios, ubicaciones, financiamiento y requisitos para comprar."
                rows={5}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Mientras mas detallada la descripcion, mejores seran los patrones generados por la IA.
              </p>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Guardar
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
