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
  const visibleRun = dashboard?.runs?.find(
    (item: any) => item.status === 'waiting_content_approval'
  ) || dashboard?.runs?.[0];
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
  const [replacementConfirmationId, setReplacementConfirmationId] = useState<string | null>(null);
  const [pendingCollisionPlan, setCollisionPlan] = useState<
    { intentId: string; strategy: 'keep' | 'combine'; keepResponseId?: string } | null
  >(null);

  useEffect(() => {
    if (!onboarding?.run) return;
    void Promise.all([refreshDashboard(), refreshReview()]);
  }, [
    onboarding?.run?.current_stage,
    onboarding?.run?.status,
    refreshDashboard,
    refreshReview,
  ]);

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

  async function reviewProposal(
    proposal: any,
    action: 'approve' | 'reject',
    confirmReplacement = false
  ) {
    const originalFragment = proposal.message_text.fragments?.[0] || { type: 'text', delay: 0 };
    const text = drafts[proposal.id] ?? originalFragment.content ?? '';
    const messageText = {
      ...proposal.message_text,
      fragments: [{ ...originalFragment, content: text }],
    };
    const response = await fetch(`/api/compiler/proposals/${proposal.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        runId,
        messageText: action === 'approve' ? messageText : undefined,
        confirmReplacement,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
  }

  async function refreshAll() {
    await Promise.all([refreshReview(), refreshDashboard(), refreshBacklog()]);
  }

  async function handleReview(proposal: any, action: 'approve' | 'reject') {
    const replacesContent = action === 'approve' && proposal.replacement_candidates?.length > 0;
    if (replacesContent && replacementConfirmationId !== proposal.id) {
      setReplacementConfirmationId(proposal.id);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await reviewProposal(proposal, action, replacesContent);
      setReplacementConfirmationId(null);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar la revisión');
    } finally {
      setBusy(false);
    }
  }

  async function approveGroup(proposals: any[]) {
    setBusy(true);
    setMessage(null);
    try {
      for (const proposal of proposals.filter(item => item.approval_status === 'pending')) {
        await reviewProposal(proposal, 'approve');
      }
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible aprobar el grupo');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Que se conserva y que se retira, calculado desde el mismo plan que se
   * enviara. Resolver una colision retira toda respuesta activa que no entre
   * en el plan, y una lista de textos con un solo boton no deja ver cual se
   * cae: el panel tiene que decirlo antes, no despues.
   */
  function collisionPlan(collision: any, strategy: 'keep' | 'combine', keepResponseId?: string) {
    const keptIds = strategy === 'keep'
      ? [keepResponseId || collision.recommended_response_id].filter(Boolean)
      : collision.recommended_response_ids || [];
    const retired = collision.responses.filter((row: any) => !keptIds.includes(row.id));
    return { strategy, keepResponseId, keptIds, retired };
  }

  async function resolveCollision(
    collision: any,
    strategy: 'keep' | 'combine' = collision.recommended_strategy,
    keepResponseId?: string
  ) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/compiler/collisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentId: collision.id,
          strategy,
          keepResponseId: strategy === 'keep'
            ? keepResponseId || collision.recommended_response_id || undefined
            : undefined,
          responseIds: strategy === 'combine' ? collision.recommended_response_ids : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setCollisionPlan(null);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible resolver la colisión');
    } finally {
      setBusy(false);
    }
  }

  const run = review?.run;
  const vocabulary = dashboard?.vocabulary;
  const projectLabel = vocabulary?.singular || 'desarrollo';

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Contenido para tu bot</h1>
        <p className="text-muted-foreground">
          Revisa las respuestas propuestas y confirma solo lo que quieras publicar.
        </p>
      </header>

      {message ? <div className="rounded-md border bg-muted p-3 text-sm">{message}</div> : null}
      {processingError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted p-3 text-sm">
          <span>{processingError}</span>
          <Button size="sm" variant="outline" onClick={retryProcessing}>Reintentar</Button>
        </div>
      ) : null}

      {(dashboard?.collisions || []).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Respuestas activas que compiten</CardTitle>
            <CardDescription>
              Revísalas juntas. Resolver la colisión deja una sola respuesta activa: antes de
              confirmar verás cuál se conserva y cuál se retira.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.collisions.map((collision: any) => {
              const planned = pendingCollisionPlan && pendingCollisionPlan.intentId === collision.id
                ? collisionPlan(collision, pendingCollisionPlan.strategy, pendingCollisionPlan.keepResponseId)
                : null;
              return (
                <div key={collision.id} className="space-y-3 rounded-md border p-4">
                  <div>
                    <div className="font-medium">{collision.display_name}</div>
                    <div className="text-sm text-muted-foreground">{collision.scopes?.name}</div>
                  </div>
                  {collision.responses.map((response: any) => {
                    const retired = planned?.retired.some((row: any) => row.id === response.id);
                    return (
                      <div
                        key={response.id}
                        className={`space-y-2 rounded p-3 text-sm ${retired ? 'bg-amber-50 text-amber-950' : 'bg-muted'}`}
                      >
                        <div className="whitespace-pre-wrap">
                          {response.response_type === 'fragmented'
                            ? (response.message_text.fragments || []).map((fragment: any) => fragment.content).join('\n\n')
                            : String(response.message_text ?? '')}
                          {response.edited_by_human ? (
                            <Badge className="ml-2" variant="secondary">Editada a mano</Badge>
                          ) : null}
                        </div>
                        {planned ? (
                          <div className="font-medium">
                            {retired
                              ? 'Se retira: deja de enviarse al lead'
                              : planned.strategy === 'combine'
                                ? 'Se conserva, como fragmento de la respuesta combinada'
                                : 'Se conserva'}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setCollisionPlan({
                              intentId: collision.id,
                              strategy: 'keep',
                              keepResponseId: response.id,
                            })}
                          >
                            Conservar solo esta
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {planned ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" disabled={busy} onClick={() =>
                        resolveCollision(collision, planned.strategy, planned.keepResponseId)
                      }>
                        {planned.retired.length === 1
                          ? 'Confirmar: se retira 1 respuesta'
                          : `Confirmar: se retiran ${planned.retired.length} respuestas`}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCollisionPlan(null)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {collision.recommended_strategy === 'combine'
                          ? 'Propuesta: conservar la respuesta principal más reciente y sus seguimientos como fragmentos.'
                          : 'Propuesta: conservar la respuesta más reciente y archivar las demás.'}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setCollisionPlan({
                          intentId: collision.id,
                          strategy: collision.recommended_strategy,
                        })}
                      >
                        Ver qué cambia
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {!runId ? (
        <Card>
          <CardHeader>
            <CardTitle>Todavía no hay respuestas para revisar</CardTitle>
            <CardDescription>Agrega tu primer {projectLabel} y comparte su material para comenzar.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild><Link href="/onboarding">Configurar mi bot</Link></Button></CardContent>
        </Card>
      ) : null}

      {run && run.current_stage !== 'review' && run.current_stage !== 'completed' ? (
        <Card>
          <CardHeader>
            <CardTitle>{run.status === 'failed' ? 'No pudimos preparar el contenido' : 'Estamos preparando tu contenido'}</CardTitle>
            <CardDescription>
              {run.status === 'failed'
                ? 'Vuelve al recorrido para intentarlo de nuevo; tus respuestas siguen guardadas.'
                : processing
                  ? 'Estamos leyendo el material y organizando las respuestas. Mantén esta pantalla abierta.'
                  : 'Hay una decisión pendiente en el recorrido antes de continuar.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild><Link href="/onboarding">Volver al recorrido</Link></Button>
          </CardContent>
        </Card>
      ) : null}

      {review && (run.current_stage === 'review' || run.current_stage === 'completed') ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="space-y-6">
            {groups.map(group => {
              const pending = group.filter(item => item.approval_status === 'pending');
              const title = group[0]?.intent_configurations?.display_name || 'Respuestas';
              return (
                <Card key={group[0].intent_configurations?.intent_name || group[0].intent_id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>{group.length} {group.length === 1 ? 'respuesta' : 'respuestas'}</CardDescription>
                      </div>
                      {pending.length > 0 && pending.every(item => item.replacement_candidates?.length === 0) ? (
                        <Button variant="outline" disabled={busy} onClick={() => approveGroup(group)}>
                          Aprobar {pending.length === 1 ? 'la respuesta' : `las ${pending.length}`}
                        </Button>
                      ) : pending.length === 0 ? (
                        <span className="text-sm text-muted-foreground">Sin nada pendiente</span>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {group.map(proposal => {
                      const sources = (proposal.compiler_proposal_facts || [])
                        .map((dependency: { fact_id: string }) => factsById.get(dependency.fact_id))
                        .filter(Boolean);
                      return (
                        <article key={proposal.id} className="space-y-3 rounded-md border p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={proposal.approval_status === 'pending' ? 'default' : 'outline'}>
                              {proposal.approval_status === 'pending'
                                ? 'Por revisar'
                                : proposal.approval_status === 'approved' ? 'Aprobada' : 'Rechazada'}
                            </Badge>
                            {/*
                              Una senal es un aviso de "mira esto antes de
                              aprobar". Sobre una respuesta ya aprobada dice lo
                              contrario de lo que la insignia de al lado afirma,
                              asi que ahi se cuenta en pasado.
                              */}
                            {proposal.review_signals.map((signal: string) => (
                              <Badge
                                key={signal}
                                variant={
                                  proposal.approval_status !== 'pending' ? 'outline'
                                    : signal === 'contradiction' ? 'destructive' : 'secondary'
                                }
                              >
                                {proposal.approval_status !== 'pending' ? 'Se aprobó con aviso: ' : ''}
                                {SIGNAL_LABELS[signal] || 'Requiere atención'}
                              </Badge>
                            ))}
                          </div>
                          <div className="text-sm font-medium text-muted-foreground">
                            Alcance: {proposal.scopes?.name || 'Sin nombre'}
                          </div>
                          <Textarea
                            value={drafts[proposal.id] ?? proposal.message_text.fragments?.[0]?.content ?? ''}
                            onChange={event => setDrafts(current => ({ ...current, [proposal.id]: event.target.value }))}
                            disabled={proposal.approval_status !== 'pending'}
                          />
                          {sources.length > 0 ? (
                            <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                              <div className="font-medium">De dónde salió este dato</div>
                              {sources.map((fact: any) => (
                                <a
                                  key={fact.id}
                                  className="flex items-start gap-2 text-primary underline-offset-4 hover:underline"
                                  href={`/api/compiler/materials/${fact.material_id}#page=${fact.page_number}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span>{fact.compiler_materials?.original_filename}, página {fact.page_number}</span>
                                </a>
                              ))}
                            </div>
                          ) : null}
                          {proposal.replacement_candidates?.length > 0 ? (
                            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                              <div className="font-medium">
                                Esta aprobación sustituirá {proposal.replacement_candidates.length === 1
                                  ? 'la respuesta activa'
                                  : `${proposal.replacement_candidates.length} respuestas activas`}.
                              </div>
                              {proposal.replacement_candidates.map((response: any) => (
                                <div key={response.id} className="whitespace-pre-wrap">
                                  {response.response_type === 'fragmented'
                                    ? (response.message_text.fragments || []).map((fragment: any) => fragment.content).join('\n\n')
                                    : String(response.message_text ?? '')}
                                  {response.edited_by_human ? ' (editada a mano)' : ''}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {/*
                            Una respuesta ya resuelta no lleva botones. Antes se
                            mostraban en gris: un boton que no responde y no dice
                            por que se lee como una pantalla rota, no como una
                            decision que ya se tomo.
                          */}
                          {proposal.approval_status === 'pending' ? (
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleReview(proposal, 'approve')} disabled={busy}>
                                {replacementConfirmationId === proposal.id ? 'Confirmar sustitución' : 'Aprobar'}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleReview(proposal, 'reject')} disabled={busy}>Rechazar</Button>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {proposal.approval_status === 'approved'
                                ? 'Ya la aprobaste: el bot la está usando. Para cambiarla, edítala desde el contenido del bot.'
                                : 'La rechazaste: el bot no la usa.'}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
            {groups.length === 0 ? (
              <Card><CardContent className="pt-6 text-sm text-muted-foreground">Todavía no hay respuestas para revisar.</CardContent></Card>
            ) : null}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Información que falta</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {review.coverage.filter((item: any) => item.status !== 'covered' || item.placement_error).map((item: any) => (
                  <div key={item.id} className="rounded-md border p-3 text-sm">
                    <div>{item.question}</div>
                    {item.placement_error ? (
                      <div className="mt-1 text-muted-foreground">{item.placement_error}</div>
                    ) : null}
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
                <CardDescription>
                  {(backlogData?.backlog || []).reduce((total: number, item: any) => total + item.count, 0)} preguntas registradas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(backlogData?.backlog || []).map((item: any) => (
                  <div key={`${item.scopeId}-${item.message}`} className="rounded-md border p-3 text-sm">
                    <div>{item.message}</div>
                    <Badge className="mt-2" variant="outline">{item.count} veces</Badge>
                  </div>
                ))}
                {backlogData && backlogData.backlog.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay preguntas pendientes para este {projectLabel}.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
