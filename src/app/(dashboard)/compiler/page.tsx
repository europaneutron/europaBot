'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useOnboardingProcessing } from '@/hooks/use-onboarding-processing';

const SIGNAL_LABELS: Record<string, string> = {
  unsupported: 'Falta respaldo',
  contradiction: 'Hay datos distintos',
  uncertain_provenance: 'No pudimos confirmar el origen',
  sensitive_data: 'Revisar antes de publicar',
  changed: 'Cambió desde la última revisión',
  human_edited: 'Editada a mano',
  poor_vocabulary: 'Vocabulario bloqueado',
  vocabulary_regression: 'Pierde formas de preguntar',
  unoffered_yes_no: 'Pregunta sin oferta declarada',
  crosses_branches_unnamed: 'Mezcla ramas sin nombrarlas',
};

async function fetcher(url: string) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No fue posible cargar el contenido');
  return body;
}

export default function CompilerPage() {
  const { data: dashboard, mutate: refreshDashboard } = useSWR('/api/compiler', fetcher);
  const { data: onboarding, mutate: refreshOnboarding } = useSWR('/api/onboarding', fetcher);
  const { processing, processingError, retryProcessing } = useOnboardingProcessing(onboarding, refreshOnboarding);
  const visibleRun = dashboard?.runs?.find((item: any) => item.status === 'waiting_content_approval')
    || dashboard?.runs?.[0];
  const runId = visibleRun?.id || '';
  const { data: review, mutate: refreshReview } = useSWR(
    runId ? `/api/compiler/runs/${runId}` : null,
    fetcher
  );
  const scopeId = review?.run?.scope_id || '';
  const { data: backlogData, mutate: refreshBacklog } = useSWR(
    scopeId ? `/api/compiler/backlog?scopeId=${scopeId}` : null,
    fetcher
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!onboarding?.run) return;
    void Promise.all([refreshDashboard(), refreshReview()]);
  }, [onboarding?.run?.current_stage, onboarding?.run?.status, refreshDashboard, refreshReview]);

  const groups = useMemo(() => {
    const byIntent = new Map<string, any[]>();
    for (const proposal of review?.proposals || []) {
      const key = proposal.intent_configurations?.intent_name || proposal.intent_id;
      const rows = byIntent.get(key) || [];
      rows.push(proposal);
      byIntent.set(key, rows);
    }
    return Array.from(byIntent.values()).sort((left, right) => {
      const leftSignals = Math.max(...left.map(item => item.review_signals.length), 0);
      const rightSignals = Math.max(...right.map(item => item.review_signals.length), 0);
      return rightSignals - leftSignals;
    });
  }, [review]);

  const factsById = useMemo(
    () => new Map((review?.facts || []).map((fact: any) => [fact.id, fact])),
    [review]
  );

  async function refreshAll() {
    await Promise.all([refreshReview(), refreshDashboard(), refreshBacklog()]);
  }

  async function reviewProposal(proposal: any, action: 'save' | 'reject') {
    setBusy(true);
    setMessage(null);
    try {
      const originalFragment = proposal.message_text.fragments?.[0] || { type: 'text', delay: 0 };
      const text = drafts[proposal.id] ?? originalFragment.content ?? '';
      const response = await fetch(`/api/compiler/proposals/${proposal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          messageText: action === 'save' ? {
            ...proposal.message_text,
            fragments: [{ ...originalFragment, content: text }],
          } : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(action === 'save' ? 'Cambios guardados. Nada se publicará hasta que publiques la corrida.' : null);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar la revisión');
    } finally {
      setBusy(false);
    }
  }

  async function publishRun() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/compiler/runs/${runId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const published = body.result?.published_responses || 0;
      const blocked = body.result?.blocked_responses || 0;
      setMessage(`${published} ${published === 1 ? 'respuesta publicada' : 'respuestas publicadas'}${blocked ? `; ${blocked} ${blocked === 1 ? 'quedó bloqueada' : 'quedaron bloqueadas'} por vocabulario` : ''}.`);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible publicar la corrida');
    } finally {
      setBusy(false);
    }
  }

  const run = review?.run;
  const impact = review?.publication_impact;
  const projectLabel = dashboard?.vocabulary?.singular || 'desarrollo';
  const pendingProposals = (review?.proposals || []).filter((item: any) => item.approval_status === 'pending');
  const publishableCount = pendingProposals.filter((item: any) => item.is_publishable !== false).length;
  const blockedCount = pendingProposals.length - publishableCount;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Contenido para tu bot</h1>
        <p className="text-muted-foreground">Edita o rechaza propuestas y publica toda la corrida en un solo paso.</p>
      </header>

      {message ? <div className="rounded-md border bg-muted p-3 text-sm">{message}</div> : null}
      {processingError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted p-3 text-sm">
          <span>{processingError}</span>
          <Button size="sm" variant="outline" onClick={retryProcessing}>Reintentar</Button>
        </div>
      ) : null}

      {!runId ? (
        <Card>
          <CardHeader>
            <CardTitle>Todavía no hay respuestas para revisar</CardTitle>
            <CardDescription>Comparte el material completo del negocio para comenzar.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild><Link href="/onboarding">Configurar mi bot</Link></Button></CardContent>
        </Card>
      ) : null}

      {run && run.current_stage !== 'review' && run.current_stage !== 'completed' ? (
        <Card>
          <CardHeader>
            <CardTitle>{run.status === 'failed' ? 'No pudimos preparar el contenido' : 'Estamos preparando tu contenido'}</CardTitle>
            <CardDescription>{processing ? 'Estamos leyendo todos los materiales.' : 'Hay una decisión pendiente en el recorrido.'}</CardDescription>
          </CardHeader>
          <CardContent><Button variant="outline" asChild><Link href="/onboarding">Volver al recorrido</Link></Button></CardContent>
        </Card>
      ) : null}

      {review && run.current_stage === 'review' ? (
        <Card>
          <CardHeader>
            <CardTitle>{run.replacement_mode === 'add' ? 'Esta corrida añadirá contenido' : 'Esta corrida sustituirá el contenido actual'}</CardTitle>
            <CardDescription>
              {run.replacement_mode === 'add'
                ? 'Lo que ya existe se conserva; una pregunta repetida se reemplaza solo en su mismo alcance.'
                : `${impact?.retired_responses || 0} respuestas se retirarán${impact?.human_edited_responses ? `, incluidas ${impact.human_edited_responses} editadas a mano` : ''}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {run.replacement_mode === 'replace' && impact?.retired_scopes?.length > 0 ? (
              <div className="text-sm">
                Dejarán de ofrecerse: {impact.retired_scopes.map((scope: any) => scope.name).join(', ')}.
              </div>
            ) : null}
            <Button disabled={busy || pendingProposals.length === 0} onClick={publishRun}>
              Publicar {publishableCount} {publishableCount === 1 ? 'respuesta' : 'respuestas'}
            </Button>
            {blockedCount > 0 ? (
              <p className="text-sm text-muted-foreground">
                {blockedCount} {blockedCount === 1 ? 'propuesta quedará fuera' : 'propuestas quedarán fuera'} porque su vocabulario no reconoce la pregunta.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {review && (run.current_stage === 'review' || run.current_stage === 'completed') ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="space-y-6">
            {groups.map(group => {
              const title = group[0]?.intent_configurations?.display_name || 'Respuestas';
              return (
                <Card key={group[0].intent_configurations?.intent_name || group[0].intent_id}>
                  <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{group.length} {group.length === 1 ? 'respuesta nueva' : 'respuestas nuevas'}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {group.map(proposal => {
                      const sources = (proposal.compiler_proposal_facts || [])
                        .map((dependency: { fact_id: string }) => factsById.get(dependency.fact_id))
                        .filter(Boolean);
                      return (
                        <article key={proposal.id} className="space-y-3 rounded-md border p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={proposal.is_publishable === false ? 'destructive' : proposal.approval_status === 'pending' ? 'default' : 'outline'}>
                              {proposal.is_publishable === false
                                ? 'Bloqueada'
                                : proposal.approval_status === 'pending' ? 'Incluida' : proposal.approval_status === 'approved' ? 'Publicada' : 'Rechazada'}
                            </Badge>
                            {proposal.review_signals.map((signal: string) => (
                              <Badge key={signal} variant={signal === 'contradiction' ? 'destructive' : 'secondary'}>
                                {SIGNAL_LABELS[signal] || 'Requiere atención'}
                              </Badge>
                            ))}
                          </div>
                          <div className="text-sm font-medium text-muted-foreground">Alcance: {proposal.scopes?.name || 'Sin nombre'}</div>
                          {proposal.review_details?.vocabulary?.missed?.length > 0 ? (
                            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                              <div className="font-medium">El vocabulario no reconoce estas formas:</div>
                              <div className="mt-1 text-muted-foreground">{proposal.review_details.vocabulary.missed.join('; ')}</div>
                            </div>
                          ) : null}
                          {proposal.review_details?.regression?.missed?.length > 0 ? (
                            <div className="rounded-md bg-muted p-3 text-sm">
                              <div className="font-medium">Formas que dejaría de reconocer:</div>
                              <div className="mt-1 text-muted-foreground">{proposal.review_details.regression.missed.join('; ')}</div>
                            </div>
                          ) : null}
                          {proposal.review_details?.offer?.reason ? (
                            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                              <div className="font-medium">Oferta sin declarar:</div>
                              <div className="mt-1 text-muted-foreground">{proposal.review_details.offer.reason}</div>
                            </div>
                          ) : null}
                          {proposal.review_details?.branches?.reason ? (
                            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                              <div className="font-medium">Ramas mezcladas:</div>
                              <div className="mt-1 text-muted-foreground">{proposal.review_details.branches.reason}</div>
                            </div>
                          ) : null}
                          <Textarea
                            value={drafts[proposal.id] ?? proposal.message_text.fragments?.[0]?.content ?? ''}
                            onChange={event => setDrafts(current => ({ ...current, [proposal.id]: event.target.value }))}
                            disabled={proposal.approval_status !== 'pending' || proposal.is_publishable === false}
                          />
                          {sources.length > 0 ? (
                            <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                              <div className="font-medium">De dónde salió este dato</div>
                              {sources.map((fact: any) => (
                                <a key={fact.id} className="flex items-start gap-2 text-primary hover:underline" href={`/api/compiler/materials/${fact.material_id}#page=${fact.page_number}`} target="_blank" rel="noreferrer">
                                  <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span>{fact.compiler_materials?.original_filename}, página {fact.page_number}</span>
                                </a>
                              ))}
                            </div>
                          ) : null}
                          {proposal.approval_status === 'pending' && proposal.is_publishable !== false ? (
                            <div className="flex gap-2">
                              <Button size="sm" disabled={busy} onClick={() => reviewProposal(proposal, 'save')}>Guardar edición</Button>
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => reviewProposal(proposal, 'reject')}>Rechazar</Button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Información que falta</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {review.coverage.filter((item: any) => item.status !== 'covered' || item.placement_error).map((item: any) => (
                  <div key={item.id} className="rounded-md border p-3 text-sm">
                    <div>{item.question}</div>
                    {item.placement_error ? <div className="mt-1 text-muted-foreground">{item.placement_error}</div> : null}
                  </div>
                ))}
                {review.coverage.every((item: any) => item.status === 'covered' && !item.placement_error) ? (
                  <p className="text-sm text-muted-foreground">El material cubre todas las preguntas previstas.</p>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Preguntas que el bot aún no cubre</CardTitle>
                <CardDescription>{(backlogData?.backlog || []).reduce((total: number, item: any) => total + item.count, 0)} preguntas registradas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(backlogData?.backlog || []).map((item: any) => (
                  <div key={`${item.scopeId}-${item.message}`} className="rounded-md border p-3 text-sm">
                    <div>{item.message}</div><Badge className="mt-2" variant="outline">{item.count} veces</Badge>
                  </div>
                ))}
                {backlogData && backlogData.backlog.length === 0 ? <p className="text-sm text-muted-foreground">No hay preguntas pendientes para este {projectLabel}.</p> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
