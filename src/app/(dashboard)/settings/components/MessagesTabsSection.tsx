/**
 * Sección de Tabs para mensajes personalizables del bot
 */

'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { BRAND_VARIABLES, MESSAGE_VARIABLES } from '@/lib/constants/message-variables';
import { MessagePreview } from '@/components/settings/MessagePreview';
import useSWR from 'swr';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { BotConfig, configRepositoryClient } from '@/data/repositories/config.repository.client';
import { ConfigsByCategory } from '../types';
import { CitaDetectionSection } from './CitaDetectionSection';
import { FallbackButtonsEditor } from './FallbackButtonsEditor';

interface Props {
  configs: ConfigsByCategory;
  onReload: () => Promise<void>;
}

/**
 * Que puede escribir quien edita este mensaje. Una variable que el mensaje no
 * recibe sale tal cual al lead, asi que la ayuda no es cortesia: es lo que
 * evita mandar "{alcances}" a alguien.
 */
/**
 * Los fraccionamientos de verdad, para que la previsualizacion sea la del
 * negocio y no un ejemplo generico. Si todavia no hay ninguno, dos de
 * respaldo: sin nombres no se entiende el momento.
 */
function useScopeNames(): string[] {
  const { data } = useSWR('/api/scopes', async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  });
  const names = ((data?.scopes || []) as any[])
    .filter(scope => scope.is_active && scope.parent_id === data?.rootScopeId)
    .map(scope => scope.name as string);
  return names.length > 0 ? names : ['Europa Residencial', 'Malasia Residencial'];
}

function MessageVariableHelp({ configKey }: { configKey: string }) {
  const entry = MESSAGE_VARIABLES[configKey];
  // Sin entrada no se dice nada: enseñar solo las del negocio en un mensaje
  // que ademas recibe las suyas seria una ayuda incompleta, que es peor que
  // ninguna. Los mensajes de cita y derivacion todavia no estan auditados.
  if (!entry) return null;
  const variables = [...entry.vars, ...BRAND_VARIABLES];

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {entry?.hint ? <p>{entry.hint}</p> : null}
      <p className="flex flex-wrap items-center gap-1">
        <span>Puedes usar:</span>
        {variables.map(variable => (
          <code key={variable} className="rounded bg-muted px-1 py-0.5">{variable}</code>
        ))}
      </p>
    </div>
  );
}

/**
 * Como se ve este mensaje cuando el bot lo manda. Lee el textarea de al lado
 * mientras se escribe, asi que lo que se ve es lo que se acaba de teclear y no
 * lo ultimo guardado.
 */
function MessageScenePreview({ configKey }: { configKey: string }) {
  const scene = MESSAGE_VARIABLES[configKey]?.scene;
  const names = useScopeNames();
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    const field = document.getElementById(configKey) as HTMLTextAreaElement | null;
    if (!field) return;
    setDraft(field.value);
    const onInput = () => setDraft(field.value);
    field.addEventListener('input', onInput);
    return () => field.removeEventListener('input', onInput);
  }, [configKey]);

  if (!scene || draft === null) return null;

  return (
    <MessagePreview
      template={draft}
      scene={{
        lead: scene.lead,
        variables: scene.variables(names),
        buttons: scene.buttons(names),
        before: scene.before,
      }}
    />
  );
}

export function MessagesTabsSection({ configs, onReload }: Props) {
  const [saving, setSaving] = useState(false);

  async function handleSaveTab(configsToSave: BotConfig[]) {
    setSaving(true);
    try {
      const updates = configsToSave.map(config => ({
        key: config.config_key,
        value: (document.getElementById(config.config_key) as HTMLTextAreaElement)?.value || config.config_value
      }));

      await configRepositoryClient.updateMultiple(updates);
      await onReload();
    } catch (error) {
      console.error('Error saving message configs:', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mensajes Personalizables del Bot</CardTitle>
        <CardDescription>
          Personaliza todos los mensajes que el bot envía a los usuarios. Guarda cada categoría de forma independiente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="system" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="system">Sistema</TabsTrigger>
            <TabsTrigger value="fallback">Fallback</TabsTrigger>
            <TabsTrigger value="appointments">Citas</TabsTrigger>
            <TabsTrigger value="derivation">Derivación</TabsTrigger>
          </TabsList>

          {/* Tab: Mensajes de Sistema */}
          <TabsContent value="system">
            <div className="space-y-6 p-6 border rounded-md">
              <h3 className="font-semibold text-lg">Mensajes de Error y Sistema</h3>
              
              {configs.system_messages.map((config) => (
                <div key={config.config_key} className="space-y-2">
                  <Label htmlFor={config.config_key}>
                    {config.description}
                  </Label>
                  <Textarea
                    id={config.config_key}
                    name={config.config_key}
                    rows={2}
                    defaultValue={config.config_value}
                    disabled={saving}
                  />
                  <MessageScenePreview configKey={config.config_key} />
                  <MessageVariableHelp configKey={config.config_key} />
                </div>
              ))}

              <div className="flex justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => handleSaveTab(configs.system_messages)}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar Mensajes de Sistema
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Mensajes de Fallback */}
          <TabsContent value="fallback">
            <div className="space-y-6 p-6 border rounded-md">
              <h3 className="font-semibold text-lg">Mensajes de Fallback (3 niveles)</h3>

              {/* Los `_buttons` son otra fila -- json, no texto -- para los
                  botones de ese mismo nivel: se editan con su propio
                  componente debajo, no como un textarea más. */}
              {configs.fallback_messages
                .filter((config) => config.config_type !== 'json')
                .map((config) => {
                  const buttonsConfig = configs.fallback_messages.find(
                    (candidate) => candidate.config_key === `${config.config_key}_buttons`
                  );
                  return (
                    <div key={config.config_key} className="space-y-2">
                      <Label htmlFor={config.config_key}>
                        {config.description}
                      </Label>
                      <Textarea
                        id={config.config_key}
                        name={config.config_key}
                        rows={3}
                        defaultValue={config.config_value}
                        disabled={saving}
                      />
                      {buttonsConfig && (
                        <FallbackButtonsEditor
                          config={buttonsConfig}
                          label="estos botones"
                          onSaved={onReload}
                        />
                      )}
                    </div>
                  );
                })}

              <div className="flex justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => handleSaveTab(
                    configs.fallback_messages.filter((config) => config.config_type !== 'json')
                  )}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar Mensajes de Fallback
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Mensajes de Citas */}
          <TabsContent value="appointments" className="space-y-6">
            <CitaDetectionSection />
            <div className="space-y-6 p-6 border rounded-md">
              <div>
                <h3 className="font-semibold text-lg mb-2">Mensajes del Flujo de Citas</h3>
                <p className="text-sm text-muted-foreground">
                  Variables disponibles: <code className="bg-muted px-1 rounded">{'{fecha}'}</code>, 
                  <code className="bg-muted px-1 rounded ml-1">{'{hora}'}</code>, 
                  <code className="bg-muted px-1 rounded ml-1">{'{direccion}'}</code>
                </p>
              </div>
              
              {configs.appointment_messages.map((config) => (
                <div key={config.config_key} className="space-y-2">
                  <Label htmlFor={config.config_key}>
                    {config.description}
                  </Label>
                  <Textarea
                    id={config.config_key}
                    name={config.config_key}
                    rows={config.config_key.includes('confirmation') || config.config_key.includes('request_time') ? 4 : 2}
                    defaultValue={config.config_value}
                    className="font-mono text-sm"
                    disabled={saving}
                  />
                </div>
              ))}

              <div className="flex justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => handleSaveTab(configs.appointment_messages)}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar Mensajes de Citas
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Mensajes de Derivación */}
          <TabsContent value="derivation">
            <div className="space-y-6 p-6 border rounded-md">
              <div>
                <h3 className="font-semibold text-lg mb-2">Mensajes de Derivación a Asesor</h3>
                <p className="text-sm text-muted-foreground">
                  Variables disponibles: <code className="bg-muted px-1 rounded">{'{nombre}'}</code>, 
                  <code className="bg-muted px-1 rounded ml-1">{'{horario}'}</code>
                </p>
              </div>
              
              {configs.derivation_messages
                .filter((config) => config.config_type !== 'json')
                .map((config) => (
                  <div key={config.config_key} className="space-y-2">
                    <Label htmlFor={config.config_key}>
                      {config.description}
                    </Label>
                    <Textarea
                      id={config.config_key}
                      name={config.config_key}
                      rows={2}
                      defaultValue={config.config_value}
                      disabled={saving}
                    />
                  </div>
                ))}

              {(() => {
                const derivationButtons = configs.derivation_messages.find(
                  (config) => config.config_key === 'fallback_level_3_buttons'
                );
                if (!derivationButtons) return null;
                return (
                  <div className="space-y-2">
                    <Label>Botones del mensaje de derivación</Label>
                    <p className="text-xs text-muted-foreground">
                      Se ofrecen junto con la introducción y la petición de nombre --el mensaje que
                      también dispara el botón &quot;Hablar con un asesor&quot; en cualquier respuesta.
                    </p>
                    <FallbackButtonsEditor
                      config={derivationButtons}
                      label="botones de derivación"
                      onSaved={onReload}
                    />
                  </div>
                );
              })()}

              <div className="flex justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => handleSaveTab(
                    configs.derivation_messages.filter((config) => config.config_type !== 'json')
                  )}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar Mensajes de Derivación
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
