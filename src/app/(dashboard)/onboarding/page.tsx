'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Check, FileText, Loader2, MessageCircle, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  composeBusinessGreeting,
  toClientVocabulary,
} from '@/core/onboarding/client-vocabulary';
import { useOnboardingProcessing } from '@/hooks/use-onboarding-processing';

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

// Mismo limite que `scopes.name` y que el esquema de la ruta. Aqui evita que se
// escriba de mas; alla evita que entre por otra puerta.
const NAME_MAX_LENGTH = 120;

const VOCABULARY_OPTIONS = [
  { singular: 'desarrollo', plural: 'desarrollos' },
  { singular: 'fraccionamiento', plural: 'fraccionamientos' },
  { singular: 'proyecto', plural: 'proyectos' },
];

export default function OnboardingPage() {
  const { data, error, mutate } = useSWR('/api/onboarding', fetcher);
  const { processing, processingError, retryProcessing: retryStage } = useOnboardingProcessing(data, mutate);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [materialText, setMaterialText] = useState('');
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState('');
  const [aliases, setAliases] = useState('');
  const [partNames, setPartNames] = useState('');
  const [showParts, setShowParts] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [singular, setSingular] = useState('');
  const [plural, setPlural] = useState('');
  const [greetingChoice, setGreetingChoice] = useState<'keep' | 'composed'>('composed');
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  /**
   * Lo ultimo que se sembro en cada campo desde el servidor.
   *
   * La version anterior sembraba solo si el campo estaba vacio, asi que en
   * cuanto habia un valor no volvia a mirar: al pegar material nuevo la
   * pantalla seguia proponiendo el proyecto de la compilacion anterior aunque
   * el modelo ya hubiera devuelto otro. Comparar contra lo ultimo sembrado
   * distingue "el usuario no lo ha tocado" de "esta vacio", que es lo que hacia
   * falta para poder actualizarlo sin pisar lo que alguien escribio.
   */
  const seeded = useRef({ project: '', parts: '', business: '' });

  useEffect(() => {
    if (!data) return;

    const nextProject = data.proposedStructure?.projectName || '';
    if (nextProject !== seeded.current.project) {
      const previous = seeded.current.project;
      seeded.current.project = nextProject;
      setProjectName(current => (current === previous ? nextProject : current));
    }

    const nextParts = (data.proposedStructure?.partNames || []).join(', ');
    if (nextParts !== seeded.current.parts) {
      const previous = seeded.current.parts;
      seeded.current.parts = nextParts;
      setPartNames(current => (current === previous ? nextParts : current));
    }

    const nextBusiness = data.brand.business_name
      || data.proposedStructure?.businessName
      || '';
    if (nextBusiness !== seeded.current.business) {
      const previous = seeded.current.business;
      seeded.current.business = nextBusiness;
      setBusinessName(current => (current === previous ? nextBusiness : current));
    }

    if (!singular) setSingular(data.brand.project_singular || 'desarrollo');
    if (!plural) setPlural(data.brand.project_plural || 'desarrollos');
    if (data.currentGreeting && !data.brand.use_composed_greeting) setGreetingChoice('keep');
  }, [data, plural, singular]);

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
  if (error) return <div className="mx-auto max-w-2xl p-6 text-destructive">{error.message}</div>;

  const session = data.session;
  const run = data.run;
  const step = session.current_step;
  const vocabulary = data.vocabulary;
  const project = session.answers.project_name || projectName || `tu ${vocabulary.singular}`;
  const proposedParts = partNames.split(',').map(value => value.trim()).filter(Boolean);
  const overlongParts = proposedParts.filter(name => name.length > NAME_MAX_LENGTH);
  const progress = run ? progressForStage(run.current_stage) : 0;
  const greetingPreview = composeBusinessGreeting(
    businessName,
    [session.answers.project_name, ...data.projects.map((item: any) => item.name)].filter(Boolean),
    toClientVocabulary({ project_singular: singular, project_plural: plural })
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <MessageCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Configura tu bot</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Vamos a preparar tu contenido</h1>
          <p className="text-muted-foreground">Una pregunta a la vez. Tus respuestas se guardan al continuar.</p>
        </div>
        {!confirmingCancel ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirmingCancel(true)}>
            <X className="mr-2 h-4 w-4" />Cancelar
          </Button>
        ) : null}
      </header>

      {confirmingCancel ? (
        <Card><CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="font-semibold">¿Dejar la configuración?</h2>
            <p className="text-sm text-muted-foreground">
              {session.scope_id
                ? `Ya diste de alta ${project}, y eso se queda: puedes seguir editándolo desde el panel. Lo que se pierde es el avance de este recorrido.`
                : 'Todavía no se ha dado de alta nada. Tu material queda guardado y podrás volver a usarlo cuando empieces de nuevo.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={busy} onClick={async () => {
              setConfirmingCancel(false);
              await submit({ action: 'cancel' });
              await mutate();
            }}>
              Sí, dejarlo
            </Button>
            <Button variant="outline" onClick={() => setConfirmingCancel(false)}>Seguir aquí</Button>
          </div>
        </CardContent></Card>
      ) : null}

      <div className="space-y-2" aria-label={`Paso ${step} de 7`}>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Paso {step} de 7</span><span>{Math.round((step / 7) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(step / 7) * 100}%` }} />
        </div>
      </div>

      {message || processingError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted p-3 text-sm">
          <span>{message || processingError}</span>
          {processingError ? (
            <Button size="sm" variant="outline" onClick={retryStage}>
              <RotateCcw className="mr-2 h-4 w-4" />Reintentar
            </Button>
          ) : null}
        </div>
      ) : null}

      <Card><CardContent className="space-y-5 pt-6">
        {step === 1 ? (
          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Comparte el material de lo que vendes</h2>
              <p className="text-muted-foreground">Leeremos los nombres y la información para proponerte una organización.</p>
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
              {busy ? <Loader2 className="animate-spin" /> : <FileText />} Agregar material
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => submit({ action: 'manual_setup' })}>
              Todavía no tengo material; agregar los nombres a mano
            </Button>
          </section>
        ) : null}

        {step === 2 && session.answers.manual_setup ? (
          <ManualProjectForm
            busy={busy}
            vocabulary={vocabulary}
            projectName={projectName}
            aliases={aliases}
            setProjectName={setProjectName}
            setAliases={setAliases}
            onSubmit={submit}
          />
        ) : null}

        {step === 2 && !session.answers.manual_setup ? (
          run?.current_stage === 'tree' && data.proposedStructure ? (
            <section className="space-y-5">
              <div>
                <Badge variant="secondary">Propuesta lista</Badge>
                <h2 className="mt-3 text-xl font-semibold">Encontré {projectName || 'un proyecto'}{proposedParts.length ? `, con ${joinNames(proposedParts)}` : ''}. ¿Es así como lo vendes?</h2>
                <p className="text-muted-foreground">Puedes corregir cualquier nombre antes de continuar.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="proposed-project">Nombre principal</Label>
                <Input id="proposed-project" maxLength={NAME_MAX_LENGTH} value={projectName} onChange={event => setProjectName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proposed-parts">Opciones que se venden por separado</Label>
                <Input id="proposed-parts" value={partNames} onChange={event => setPartNames(event.target.value)} placeholder="Toscana, Milano, Verona" />
                <p className="text-xs text-muted-foreground">Sepáralas con comas.</p>
                {overlongParts.length ? (
                  <p className="text-xs text-destructive">
                    Acorta {overlongParts.length === 1 ? 'este nombre' : 'estos nombres'}: no pueden pasar de {NAME_MAX_LENGTH} caracteres. El detalle completo va en las respuestas, no en el nombre.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !projectName.trim() || overlongParts.length > 0} onClick={() => submit({ action: 'confirm_structure', projectName, partNames: proposedParts, flatten: false })}>
                  Sí, continuar con estos nombres
                </Button>
                {proposedParts.length ? (
                  <Button variant="outline" disabled={busy || !projectName.trim()} onClick={() => submit({ action: 'confirm_structure', projectName, partNames: [], flatten: true })}>
                    Lo vendo todo junto
                  </Button>
                ) : null}
              </div>
            </section>
          ) : run?.status === 'failed' ? (
            <RetryPanel busy={busy} onRetry={() => retryProcessing(mutate, setBusy, setMessage)} />
          ) : run?.current_stage === 'tree' ? (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">No encontramos nombres suficientes</h2>
              <p className="text-muted-foreground">Puedes agregarlos a mano y conservar el material para preparar las respuestas.</p>
              <Button onClick={() => submit({ action: 'manual_setup' })}>Agregar los nombres</Button>
            </section>
          ) : (
            <WaitingPanel progress={progress} processing={processing} />
          )
        ) : null}

        {step === 3 ? (
          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Cuando alguien visita {project}, ¿cómo suele elegir?</h2>
              <p className="text-muted-foreground">Tu respuesta define el detalle que necesita durante la conversación.</p>
            </div>
            <div className="grid gap-3">
              {session.answers.part_names?.length ? (
                <Button variant="outline" className="h-auto justify-start py-4 text-left" onClick={() => submit({ action: 'visit_flow', choice: 'decided', partNames: session.answers.part_names })}>
                  Ya viene pensando en {joinNames(session.answers.part_names)}
                </Button>
              ) : (
                <Button variant="outline" className="h-auto justify-start py-4 text-left" onClick={() => setShowParts(true)}>
                  Ya viene decidido por una opción específica
                </Button>
              )}
              <Button variant="outline" className="h-auto justify-start py-4 text-left" onClick={() => submit({ action: 'visit_flow', choice: 'guided', partNames: [] })}>
                Le mostramos varias opciones durante la visita
              </Button>
              <Button variant="ghost" className="justify-start" onClick={() => submit({ action: 'visit_flow', choice: 'unsure', partNames: [] })}>No estoy seguro</Button>
            </div>
            {showParts ? (
              <div className="space-y-3 rounded-md border p-4">
                <Label htmlFor="manual-parts">¿Cómo se llaman esas opciones?</Label>
                <Input id="manual-parts" value={partNames} onChange={event => setPartNames(event.target.value)} placeholder="Toscana, Milano" />
                <Button onClick={() => submit({ action: 'visit_flow', choice: 'decided', partNames: proposedParts })}>Continuar</Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">¿Quién habla y qué palabra usa?</h2>
              <p className="text-muted-foreground">El nombre es tu negocio; la palabra es como llamas a {project} y a los demás.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-name">Nombre del negocio</Label>
              <Input id="business-name" maxLength={NAME_MAX_LENGTH} value={businessName} onChange={event => setBusinessName(event.target.value)} placeholder="Inmobiliaria Altavista" />
              {!businessName && data.proposedStructure?.businessName ? <p className="text-xs text-muted-foreground">Sugerencia del material: {data.proposedStructure.businessName}</p> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {VOCABULARY_OPTIONS.map(option => (
                <Button key={option.singular} type="button" variant={singular === option.singular ? 'default' : 'outline'} onClick={() => { setSingular(option.singular); setPlural(option.plural); }}>
                  {option.singular.charAt(0).toUpperCase() + option.singular.slice(1)}
                </Button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input aria-label="Palabra en singular" value={singular} onChange={event => setSingular(event.target.value)} />
              <Input aria-label="Palabra en plural" value={plural} onChange={event => setPlural(event.target.value)} />
            </div>
            <div className="space-y-3">
              <h3 className="font-medium">Así saludará el bot</h3>
              {data.currentGreeting ? (
                <button type="button" className={`w-full rounded-md border p-4 text-left ${greetingChoice === 'keep' ? 'border-primary' : ''}`} onClick={() => setGreetingChoice('keep')}>
                  <span className="font-medium">Conservar mi saludo actual</span>
                  <span className="mt-2 block whitespace-pre-wrap text-sm text-muted-foreground">{data.currentGreeting}</span>
                </button>
              ) : null}
              <button type="button" className={`w-full rounded-md border p-4 text-left ${greetingChoice === 'composed' ? 'border-primary' : ''}`} onClick={() => setGreetingChoice('composed')}>
                <span className="font-medium">Usar el saludo que se actualiza con mis proyectos</span>
                <span className="mt-2 block whitespace-pre-wrap text-sm text-muted-foreground">{greetingPreview}</span>
              </button>
            </div>
            <Button disabled={busy || !businessName.trim() || !singular.trim() || !plural.trim()} onClick={() => submit({ action: 'identity', businessName, singular, plural, greetingChoice })}>Continuar</Button>
            {!businessName ? <Button variant="ghost" onClick={() => setBusinessName('Mi negocio')}>No estoy seguro; usar un nombre temporal</Button> : null}
          </section>
        ) : null}

        {step === 5 ? (
          <section className="space-y-5">
            <Badge variant="secondary">Objetivo listo</Badge>
            <div>
              <h2 className="text-xl font-semibold">Tu bot va a ayudar a agendar visitas a {project}</h2>
              <p className="text-muted-foreground">También responderá las preguntas que pueda respaldar con tu material.</p>
            </div>
            <Button disabled={busy} onClick={() => submit({ action: 'goal' })}>Continuar</Button>
          </section>
        ) : null}

        {step === 6 ? (
          <section className="space-y-5">
            {run?.status === 'failed' ? <RetryPanel busy={busy} onRetry={() => retryProcessing(mutate, setBusy, setMessage)} /> : null}
            {(!run || run.current_stage === 'content') && !session.answers.tone ? (
              <>
                <div><h2 className="text-xl font-semibold">¿Cuál suena más a tu negocio?</h2><p className="text-muted-foreground">Elige viendo el mensaje que recibirá un cliente.</p></div>
                <div className="grid gap-3">
                  {data.samples.map((sample: { tone: Tone; label: string; message: string }) => (
                    <button key={sample.tone} type="button" disabled={busy} onClick={() => submit({ action: 'tone', tone: sample.tone })} className="rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-50">
                      <span className="font-medium">{sample.label}</span><span className="mt-2 block text-sm text-muted-foreground">{sample.message}</span>
                    </button>
                  ))}
                  <Button variant="ghost" disabled={busy} onClick={() => submit({ action: 'tone', tone: 'friendly' })}>No estoy seguro; usar el tono recomendado</Button>
                </div>
              </>
            ) : run?.status !== 'failed' ? <WaitingPanel progress={progress} processing={processing} /> : null}
          </section>
        ) : null}

        {step === 7 ? (
          <section className="space-y-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check /></div>
            <div><h2 className="text-xl font-semibold">El contenido de {project} está listo</h2><p className="text-muted-foreground">{run ? 'Revisa primero lo que requiere atención y de dónde salió cada dato.' : 'Puedes agregar material más adelante para preparar respuestas.'}</p></div>
            <div className="flex flex-wrap gap-3">
              {run ? <Button asChild><Link href="/compiler">Revisar respuestas</Link></Button> : null}
              <Button variant="outline" disabled={busy} onClick={() => submit({ action: 'start' })}>Agregar otro {vocabulary.singular}</Button>
            </div>
          </section>
        ) : null}
      </CardContent></Card>
    </div>
  );
}

function ManualProjectForm({ busy, vocabulary, projectName, aliases, setProjectName, setAliases, onSubmit }: any) {
  return <section className="space-y-5">
    <div><h2 className="text-xl font-semibold">¿Cómo se llama tu primer {vocabulary.singular}?</h2><p className="text-muted-foreground">También reconoceremos los otros nombres que uses.</p></div>
    <div className="space-y-2"><Label htmlFor="project-name">Nombre</Label><Input id="project-name" maxLength={NAME_MAX_LENGTH} value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Altavista" /></div>
    <div className="space-y-2"><Label htmlFor="aliases">Otros nombres</Label><Input id="aliases" value={aliases} onChange={event => setAliases(event.target.value)} placeholder="Altavista Norte, Residencial Altavista" /></div>
    <Button disabled={busy || !projectName.trim()} onClick={() => onSubmit({ action: 'project', name: projectName, aliases: aliases.split(',').map((value: string) => value.trim()).filter(Boolean) })}>Continuar</Button>
    <Button variant="ghost" disabled={busy} onClick={() => onSubmit({ action: 'project', name: `Mi ${vocabulary.singular}`, aliases: [] })}>No estoy seguro; usar un nombre temporal</Button>
  </section>;
}

function WaitingPanel({ progress, processing }: { progress: number; processing: boolean }) {
  return <section className="space-y-4">
    <div><h2 className="text-xl font-semibold">Estamos preparando tu contenido</h2><p className="text-muted-foreground">Puede tardar varios minutos. Mantén esta pantalla abierta; si sales, continuaremos desde aquí cuando vuelvas.</p></div>
    <div className="space-y-2"><div className="flex justify-between text-sm"><span>{processing ? 'Leyendo y organizando la información' : 'Listo para continuar'}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div>
    {processing ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Seguimos trabajando en esta pantalla.</div> : null}
  </section>;
}

function RetryPanel({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  return <section className="space-y-4"><div><h2 className="text-xl font-semibold">No pudimos preparar el contenido</h2><p className="text-muted-foreground">Tus respuestas siguen guardadas. Puedes intentarlo otra vez.</p></div><Button variant="outline" disabled={busy} onClick={onRetry}><RotateCcw /> Volver a intentar</Button></section>;
}

function progressForStage(stage: string): number {
  return ({ extract_facts: 20, consolidate_facts: 45, tree: 60, catalog: 75, content: 90, review: 100, completed: 100 } as Record<string, number>)[stage] || 10;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

async function retryProcessing(mutate: () => Promise<unknown>, setBusy: (value: boolean) => void, setMessage: (value: string | null) => void) {
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
