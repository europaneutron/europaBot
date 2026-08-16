'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { FileText, Loader2, Play, ShieldCheck, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Error al cargar datos');
  return body;
};

const SIGNAL_LABELS: Record<string, string> = {
  unsupported: 'Sin respaldo',
  contradiction: 'Contradicción',
  uncertain_provenance: 'Procedencia dudosa',
  sensitive_data: 'Dato sensible',
  changed: 'Cambió',
  human_edited: 'Editada a mano',
};

export default function CompilerPage() {
  const { data: dashboard, mutate: refreshDashboard } = useSWR('/api/compiler', fetcher);
  const [runId, setRunId] = useState<string>('');
  const [scopeId, setScopeId] = useState('');
  const { data: review, mutate: refreshReview } = useSWR(
    runId ? `/api/compiler/runs/${runId}` : null,
    fetcher
  );
  const { data: backlogData, mutate: refreshBacklog } = useSWR(
    scopeId ? `/api/compiler/backlog?scopeId=${scopeId}` : null,
    fetcher
  );
  const [textMaterial, setTextMaterial] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!scopeId && dashboard?.scopes?.length) setScopeId(dashboard.scopes[0].id);
    if (!runId && dashboard?.runs?.length) setRunId(dashboard.runs[0].id);
  }, [dashboard, runId, scopeId]);

  const pendingClean = useMemo(
    () => (review?.proposals || []).filter(
      (proposal: any) => proposal.approval_status === 'pending' && proposal.review_signals.length === 0
    ),
    [review]
  );

  async function ingest() {
    if (!scopeId || (!file && !textMaterial.trim())) {
      setMessage('Selecciona un alcance y agrega un archivo o texto.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      let response: Response;
      if (file) {
        const form = new FormData();
        form.set('scopeId', scopeId);
        form.set('file', file);
        response = await fetch('/api/compiler', { method: 'POST', body: form });
      } else {
        response = await fetch('/api/compiler', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scopeId, text: textMaterial, filename: 'material.txt' }),
        });
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setRunId(body.run.id);
      setFile(null);
      setTextMaterial('');
      await refreshDashboard();
      setMessage('Material conservado. La extracción está lista para iniciar.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible subir el material');
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action?: 'approve_tree') {
    if (!runId) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/compiler/runs/${runId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action ? { action } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await Promise.all([refreshReview(), refreshDashboard(), refreshBacklog()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible avanzar');
    } finally {
      setBusy(false);
    }
  }

  async function reviewProposal(proposal: any, action: 'approve' | 'reject') {
    const text = drafts[proposal.id] ?? proposal.message_text.fragments?.[0]?.content ?? '';
    const messageText = {
      ...proposal.message_text,
      fragments: [{ ...proposal.message_text.fragments[0], content: text }],
    };
    const response = await fetch(`/api/compiler/proposals/${proposal.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, runId, messageText: action === 'approve' ? messageText : undefined }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
  }

  async function handleReview(proposal: any, action: 'approve' | 'reject') {
    setBusy(true);
    try {
      await reviewProposal(proposal, action);
      await Promise.all([refreshReview(), refreshDashboard(), refreshBacklog()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible revisar la propuesta');
    } finally {
      setBusy(false);
    }
  }

  async function approveClean() {
    setBusy(true);
    try {
      for (const proposal of pendingClean) await reviewProposal(proposal, 'approve');
      await Promise.all([refreshReview(), refreshDashboard(), refreshBacklog()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible aprobar el grupo');
    } finally {
      setBusy(false);
    }
  }

  const run = review?.run;
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compilador de documentos</h1>
        <p className="text-muted-foreground">
          Convierte material comercial en contenido trazable que solo se publica después de aprobarlo.
        </p>
      </div>

      {message ? <div className="rounded-md border bg-muted p-3 text-sm">{message}</div> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Material</CardTitle>
            <CardDescription>PDF, Word o texto plano. El original queda conservado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Alcance</Label>
              <Select value={scopeId} onValueChange={setScopeId}>
                <SelectTrigger><SelectValue placeholder="Selecciona un alcance" /></SelectTrigger>
                <SelectContent>
                  {(dashboard?.scopes || []).map((scope: any) => (
                    <SelectItem key={scope.id} value={scope.id}>{scope.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="compiler-file">Archivo</Label>
              <Input
                id="compiler-file"
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={event => setFile(event.target.files?.[0] || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="compiler-text">O pega texto</Label>
              <Textarea
                id="compiler-text"
                rows={6}
                value={textMaterial}
                onChange={event => setTextMaterial(event.target.value)}
                disabled={Boolean(file)}
              />
            </div>
            <Button onClick={ingest} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              Conservar material
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Compilación por etapas</CardTitle>
            <CardDescription>Cada etapa guarda su resultado y puede retomarse.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={runId} onValueChange={setRunId}>
              <SelectTrigger><SelectValue placeholder="Selecciona una compilación" /></SelectTrigger>
              <SelectContent>
                {(dashboard?.runs || []).map((item: any) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.scopes?.name || 'Alcance'} · {item.current_stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {run ? (
              <div className="space-y-3 rounded-md border p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{run.current_stage}</Badge>
                  <Badge variant="outline">{run.status}</Badge>
                </div>
                {run.last_error ? <p className="text-sm text-destructive">{run.last_error}</p> : null}
                {run.current_stage === 'tree' && !run.tree_approved_at ? (
                  <Button onClick={() => runAction('approve_tree')} disabled={busy}>
                    <ShieldCheck /> Confirmar estructura
                  </Button>
                ) : run.current_stage !== 'review' && run.current_stage !== 'completed' ? (
                  <Button onClick={() => runAction()} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <Play />} Ejecutar siguiente etapa
                  </Button>
                ) : null}
                {Array.isArray(run.proposed_tree) && run.proposed_tree.length > 0 ? (
                  <pre className="overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(run.proposed_tree, null, 2)}</pre>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {review ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>3. Revisión de contenido</CardTitle>
                  <CardDescription>Lo señalado aparece primero. Las señales informan, no bloquean.</CardDescription>
                </div>
                <Button variant="outline" onClick={approveClean} disabled={busy || pendingClean.length === 0}>
                  Aprobar limpias ({pendingClean.length})
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {review.proposals.map((proposal: any) => (
                <div key={proposal.id} className="space-y-3 rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={proposal.approval_status === 'pending' ? 'default' : 'outline'}>
                      {proposal.approval_status}
                    </Badge>
                    {proposal.review_signals.map((signal: string) => (
                      <Badge key={signal} variant={signal === 'contradiction' ? 'destructive' : 'secondary'}>
                        {SIGNAL_LABELS[signal] || signal}
                      </Badge>
                    ))}
                  </div>
                  <Textarea
                    value={drafts[proposal.id] ?? proposal.message_text.fragments?.[0]?.content ?? ''}
                    onChange={event => setDrafts(current => ({ ...current, [proposal.id]: event.target.value }))}
                    disabled={proposal.approval_status !== 'pending'}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleReview(proposal, 'approve')} disabled={busy || proposal.approval_status !== 'pending'}>Aprobar</Button>
                    <Button size="sm" variant="outline" onClick={() => handleReview(proposal, 'reject')} disabled={busy || proposal.approval_status !== 'pending'}>Rechazar</Button>
                  </div>
                </div>
              ))}
              {review.proposals.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay propuestas.</p> : null}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Hechos y procedencia</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {review.facts.map((fact: any) => (
                  <div key={fact.id} className="rounded-md border p-3 text-sm">
                    <div className="font-medium">{fact.fact_key}</div>
                    <div className="break-words text-muted-foreground">{JSON.stringify(fact.fact_value)}</div>
                    <a
                      className="mt-2 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      href={`/api/compiler/materials/${fact.material_id}#page=${fact.page_number}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText /> {fact.compiler_materials?.original_filename}, página {fact.page_number}
                    </a>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Huecos</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {review.coverage.filter((item: any) => item.status !== 'covered').map((item: any) => (
                  <div key={item.id} className="rounded-md border p-3 text-sm">{item.question}</div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Preguntas que faltan por compilar</CardTitle>
          <CardDescription>
            {(backlogData?.backlog || []).reduce((total: number, item: any) => total + item.count, 0)} escalamientos registrados que contenido nuevo podría evitar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(backlogData?.backlog || []).map((item: any) => (
            <div key={`${item.scopeId}-${item.message}`} className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm">
              <div>
                <div>{item.message}</div>
                {item.coverageQuestion ? <div className="text-muted-foreground">Relacionado con: {item.coverageQuestion}</div> : null}
              </div>
              <Badge variant="outline">{item.count} veces</Badge>
            </div>
          ))}
          {backlogData && backlogData.backlog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay preguntas pendientes para este alcance.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
