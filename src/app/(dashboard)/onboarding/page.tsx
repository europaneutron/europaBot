'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Check, FileText, Loader2, MessageCircle, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Tone = 'friendly' | 'direct' | 'formal';

async function fetcher(url: string) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No fue posible cargar el recorrido');
  return body;
}

async function postJson(body: Record<string, unknown>) {
  const response = await fetch('/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No fue posible guardar la respuesta');
  return result;
}

const VOCABULARY_OPTIONS = [
  { singular: 'desarrollo', plural: 'desarrollos' },
  { singular: 'fraccionamiento', plural: 'fraccionamientos' },
  { singular: 'proyecto', plural: 'proyectos' },
];

export default function OnboardingPage() {
  const { data, error, mutate } = useSWR('/api/onboarding', fetcher);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [customVocabulary, setCustomVocabulary] = useState(false);
  const [singular, setSingular] = useState('');
  const [plural, setPlural] = useState('');
  const [projectName, setProjectName] = useState('');
  const [aliases, setAliases] = useState('');
  const [showParts, setShowParts] = useState(false);
  const [partNames, setPartNames] = useState('');
  const [materialText, setMaterialText] = useState('');
  const [materialFile, setMaterialFile] = useState<File | null>(null);

  const session = data?.session;
  const run = data?.run;
  const shouldAdvance = Boolean(
    session?.status === 'in_progress'
    && run
    && run.status !== 'failed'
    && run.current_stage !== 'review'
    && run.current_stage !== 'completed'
    && !(run.current_stage === 'content' && !session.answers.tone)
  );

  useEffect(() => {
    if (!shouldAdvance || busy) return;
    const timeout = window.setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch('/api/onboarding/process', { method: 'POST' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        await mutate(body, false);
      } catch (processError) {
        setMessage(processError instanceof Error ? processError.message : 'No fue posible preparar el contenido');
        await mutate();
      } finally {
        setBusy(false);
      }
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [busy, mutate, run?.current_stage, run?.status, session?.answers?.tone, shouldAdvance]);

  async function submit(action: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const next = await postJson(action);
      await mutate(next, false);
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : 'No fue posible guardar la respuesta');
    } finally {
      setBusy(false);
    }
  }

  async function submitMaterial() {
    if (!materialFile && !materialText.trim()) {
      setMessage('Agrega un archivo o pega el texto de tu material.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      if (materialFile) form.set('file', materialFile);
      else form.set('text', materialText);
      const response = await fetch('/api/onboarding', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMaterialFile(null);
      setMaterialText('');
      await mutate();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : 'No fue posible agregar el material');
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (error) {
    return <div className="mx-auto max-w-2xl p-6 text-destructive">{error.message}</div>;
  }

  const step = session.current_step;
  const vocabulary = data.vocabulary;
  const project = session.answers.project_name || projectName || `tu ${vocabulary.singular}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Configura tu bot</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Vamos a preparar tu contenido</h1>
        <p className="text-muted-foreground">Una pregunta a la vez. Puedes salir y continuar después.</p>
      </header>

      <div className="space-y-2" aria-label={`Paso ${step} de 7`}>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Paso {step} de 7</span>
          <span>{Math.round((step / 7) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(step / 7) * 100}%` }} />
        </div>
      </div>

      {message ? <div className="rounded-md border bg-muted p-3 text-sm">{message}</div> : null}

      <Card>
        <CardContent className="space-y-5 pt-6">
          {step === 1 ? (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">¿Cómo llamas a lo que vendes?</h2>
                <p className="text-muted-foreground">Usaremos esa palabra en todas las pantallas y mensajes.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {VOCABULARY_OPTIONS.map(option => (
                  <Button
                    key={option.singular}
                    variant="outline"
                    className="h-auto justify-start py-4"
                    disabled={busy}
                    onClick={() => submit({ action: 'vocabulary', ...option })}
                  >
                    {option.singular.charAt(0).toUpperCase() + option.singular.slice(1)}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" onClick={() => setCustomVocabulary(value => !value)}>
                Uso otra palabra
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => submit({ action: 'vocabulary', singular: 'desarrollo', plural: 'desarrollos' })}
              >
                No estoy seguro; usar la recomendada
              </Button>
              {customVocabulary ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="singular">En singular</Label>
                    <Input id="singular" value={singular} onChange={event => setSingular(event.target.value)} placeholder="plaza" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plural">En plural</Label>
                    <Input id="plural" value={plural} onChange={event => setPlural(event.target.value)} placeholder="plazas" />
                  </div>
                  <Button
                    className="sm:col-span-2"
                    disabled={busy || !singular.trim() || !plural.trim()}
                    onClick={() => submit({ action: 'vocabulary', singular, plural })}
                  >
                    Continuar
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">¿Cómo se llama tu primer {vocabulary.singular}?</h2>
                <p className="text-muted-foreground">Este nombre también permitirá reconocerlo cuando un cliente lo mencione.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-name">Nombre</Label>
                <Input id="project-name" value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Toscana" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aliases">Otros nombres, si los usa tu equipo</Label>
                <Input id="aliases" value={aliases} onChange={event => setAliases(event.target.value)} placeholder="Toscana Norte, Toscana Residencial" />
                <p className="text-xs text-muted-foreground">Sepáralos con comas. Puedes dejarlo vacío.</p>
              </div>
              <Button
                disabled={busy || !projectName.trim()}
                onClick={() => submit({
                  action: 'project',
                  name: projectName,
                  aliases: aliases.split(',').map(value => value.trim()).filter(Boolean),
                })}
              >
                Agregar {vocabulary.singular}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => submit({
                  action: 'project',
                  name: `Mi ${vocabulary.singular}`,
                  aliases: [],
                })}
              >
                No estoy seguro; usar un nombre temporal
              </Button>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Cuando alguien visita {project}, ¿cómo suele elegir?</h2>
                <p className="text-muted-foreground">Esto ayuda a responder con el detalle que tu proceso de venta necesita.</p>
              </div>
              <div className="grid gap-3">
                <Button variant="outline" className="h-auto justify-start py-4 text-left" onClick={() => setShowParts(true)}>
                  Ya viene decidido por una opción específica
                </Button>
                <Button variant="outline" className="h-auto justify-start py-4 text-left" onClick={() => submit({ action: 'visit_flow', choice: 'guided', partNames: [] })}>
                  Le mostramos varias opciones durante la visita
                </Button>
                <Button variant="ghost" className="justify-start" onClick={() => submit({ action: 'visit_flow', choice: 'unsure', partNames: [] })}>
                  No estoy seguro
                </Button>
              </div>
              {showParts ? (
                <div className="space-y-3 rounded-md border p-4">
                  <Label htmlFor="part-names">¿Como se llaman esas opciones?</Label>
                  <Input id="part-names" value={partNames} onChange={event => setPartNames(event.target.value)} placeholder="Toscana, Milano" />
                  <p className="text-xs text-muted-foreground">Sepáralas con comas. Si aún no lo sabes, puedes continuar sin agregarlas.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => submit({ action: 'visit_flow', choice: 'decided', partNames: partNames.split(',').map(value => value.trim()).filter(Boolean) })}>
                      Continuar
                    </Button>
                    <Button variant="ghost" onClick={() => submit({ action: 'visit_flow', choice: 'unsure', partNames: [] })}>
                      No estoy seguro
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 4 ? (
            <section className="space-y-5">
              <Badge variant="secondary">Objetivo listo</Badge>
              <div>
                <h2 className="text-xl font-semibold">Tu bot va a ayudar a agendar visitas a {project}</h2>
                <p className="text-muted-foreground">También responderá las preguntas que pueda respaldar con tu material.</p>
              </div>
              <Button disabled={busy} onClick={() => submit({ action: 'goal' })}>Continuar</Button>
            </section>
          ) : null}

          {step === 5 ? (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Comparte el material de {project}</h2>
                <p className="text-muted-foreground">Aceptamos PDF, Word o texto. Empezaremos a prepararlo en cuanto lo agregues.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-file">Archivo</Label>
                <Input id="material-file" type="file" accept=".pdf,.doc,.docx,.txt" onChange={event => setMaterialFile(event.target.files?.[0] || null)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-text">O pega el texto</Label>
                <Textarea id="material-text" rows={7} value={materialText} onChange={event => setMaterialText(event.target.value)} disabled={Boolean(materialFile)} />
              </div>
              <Button disabled={busy || (!materialFile && !materialText.trim())} onClick={submitMaterial}>
                {busy ? <Loader2 className="animate-spin" /> : <FileText />}
                Agregar material
              </Button>
            </section>
          ) : null}

          {step === 6 ? (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">{data.processing?.title || 'Estamos preparando tu contenido'}</h2>
                <p className="text-muted-foreground">{data.processing?.detail}</p>
              </div>
              {run?.status === 'failed' ? (
                <Button variant="outline" disabled={busy} onClick={() => submitProcess(mutate, setBusy, setMessage)}>
                  <RotateCcw /> Volver a intentar
                </Button>
              ) : null}
              {run?.current_stage === 'content' && !session.answers.tone ? (
                <div className="grid gap-3">
                  {data.samples.map((sample: { tone: Tone; label: string; message: string }) => (
                    <button
                      key={sample.tone}
                      type="button"
                      disabled={busy}
                      onClick={() => submit({ action: 'tone', tone: sample.tone })}
                      className="rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
                    >
                      <span className="font-medium">{sample.label}</span>
                      <span className="mt-2 block text-sm text-muted-foreground">{sample.message}</span>
                    </button>
                  ))}
                  <Button variant="ghost" disabled={busy} onClick={() => submit({ action: 'tone', tone: 'friendly' })}>
                    No estoy seguro; usar el tono recomendado
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Puedes salir; continuaremos cuando vuelvas.
                </div>
              )}
            </section>
          ) : null}

          {step === 7 ? (
            <section className="space-y-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check />
              </div>
              <div>
                <h2 className="text-xl font-semibold">El contenido de {project} está listo para revisar</h2>
                <p className="text-muted-foreground">Primero verás lo que requiere atención y de dónde salió cada dato.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild><Link href="/compiler">Revisar respuestas</Link></Button>
                <Button variant="outline" disabled={busy} onClick={() => submit({ action: 'start' })}>
                  Agregar otro {vocabulary.singular}
                </Button>
              </div>
              <BrandQuickEdit data={data} busy={busy} onSave={submit} />
            </section>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

async function submitProcess(
  mutate: () => Promise<unknown>,
  setBusy: (value: boolean) => void,
  setMessage: (value: string | null) => void
) {
  setBusy(true);
  setMessage(null);
  try {
    const response = await fetch('/api/onboarding/process', { method: 'POST' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    await mutate();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : 'No fue posible volver a intentarlo');
  } finally {
    setBusy(false);
  }
}

function BrandQuickEdit({ data, busy, onSave }: {
  data: any;
  busy: boolean;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [singular, setSingular] = useState(data.brand.project_singular);
  const [plural, setPlural] = useState(data.brand.project_plural);
  const [tone, setTone] = useState<Tone>(data.brand.tone);

  return (
    <div className="border-t pt-4">
      <Button variant="ghost" onClick={() => setOpen(value => !value)}>Cambiar palabras o tono</Button>
      {open ? (
        <div className="mt-4 space-y-4 rounded-md border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input aria-label="Palabra en singular" value={singular} onChange={event => setSingular(event.target.value)} />
            <Input aria-label="Palabra en plural" value={plural} onChange={event => setPlural(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['friendly', 'direct', 'formal'] as Tone[]).map(value => (
              <Button key={value} size="sm" variant={tone === value ? 'default' : 'outline'} onClick={() => setTone(value)}>
                {value === 'friendly' ? 'Cercano' : value === 'direct' ? 'Directo' : 'Formal'}
              </Button>
            ))}
          </div>
          <Button disabled={busy || !singular.trim() || !plural.trim()} onClick={() => onSave({ action: 'update_brand', singular, plural, tone })}>
            Guardar cambios
          </Button>
        </div>
      ) : null}
    </div>
  );
}
