/**
 * Página del Árbol de una Pregunta
 *
 * Una pregunta (`intent_name`) y la lista de respuestas que tiene: la del
 * negocio y una por cada fraccionamiento. Crear la de Malasia es un acto
 * explícito, con su nombre en el botón, y hasta que no lo haces esa fila no
 * existe.
 *
 * La pantalla enseñaba "Hereda de Inmobiliaria FYMSA" y ahí se quedaba, que
 * es la mitad de la verdad: no decía qué iba a leer el lead. Un texto escrito
 * para el catálogo --"lotes desde 700 mil en nuestros dos
 * fraccionamientos"-- suena raro en una conversación que ya es de Malasia, y
 * eso solo se ve leyéndolo. Ahora cada alcance enseña el texto que sale de
 * verdad, venga de donde venga.
 *
 * El contenido de una respuesta se sigue editando en
 * /intents/<intentId>/responses: esta página no rehace ese editor, solo le
 * da el contexto de a qué pregunta y a qué alcance pertenece.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/services/supabase/client';
import {
  intentConfigRepositoryClient,
  IntentConfiguration,
  BotResponse,
} from '@/data/repositories/intent-config.repository.client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, MessageSquare, Trash2, Loader2, Archive, ArchiveRestore, Edit } from 'lucide-react';
import { buildQuestionTree, countOrphanedByDeleting, TreeNode, TreeScope } from '@/lib/question-tree';

const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';

type Scope = TreeScope;
type QuestionTreeNode = TreeNode<Scope, IntentConfiguration>;

function describeResponse(response: BotResponse): string {
  const text = response.message_text;
  if (typeof text === 'string') return text;
  if (text && typeof text === 'object' && Array.isArray((text as any).fragments)) {
    return (text as any).fragments
      .map((fragment: any) => (fragment.type === 'text' ? fragment.content : `[${fragment.type}]`))
      .join(' · ');
  }
  return '';
}

export default function QuestionTreePage() {
  const params = useParams<{ intentName: string }>();
  const router = useRouter();
  const intentName = decodeURIComponent(params.intentName);

  const [rows, setRows] = useState<IntentConfiguration[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [responses, setResponses] = useState<BotResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyScopeId, setBusyScopeId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentName]);

  async function loadData() {
    try {
      setLoading(true);
      const [rowsData, scopesResult] = await Promise.all([
        intentConfigRepositoryClient.getByIntentName(intentName),
        supabase.from('scopes').select('id, parent_id, name, is_active'),
      ]);
      if (scopesResult.error) throw scopesResult.error;

      setRows(rowsData);
      setScopes((scopesResult.data || []) as Scope[]);

      const responsesData = await intentConfigRepositoryClient.getResponsesByIntentIds(
        rowsData.map(row => row.id)
      );
      setResponses(responsesData);
    } catch (err) {
      console.error('Error loading question tree:', err);
      setError('No fue posible cargar el árbol de esta pregunta');
    } finally {
      setLoading(false);
    }
  }

  const tree = useMemo(
    () => buildQuestionTree(scopes, rows, ROOT_SCOPE_ID),
    [scopes, rows]
  );
  const displayName = rows.find(row => row.scope_id === ROOT_SCOPE_ID)?.display_name
    || rows[0]?.display_name
    || intentName;

  /**
   * El estado de la pregunta en una linea. Es la parte que faltaba para poder
   * llenar el bot a mano: abrir la pregunta y saber que te falta, en vez de
   * descubrirlo cuando un cliente lee el texto de otro fraccionamiento.
   *
   * Cuenta solo los alcances de debajo de la raiz: la del negocio no es un
   * hueco, es la general.
   */
  const coverage = useMemo(() => {
    // Tener fila no es tener respuesta: una fila vacia se detecta y no
    // contesta, que es peor que no existir. Se cuenta el texto, no la fila.
    const hasText = (rowId: string | undefined) =>
      Boolean(rowId) && responses.some(response => response.intent_id === rowId);
    const answers = (node: QuestionTreeNode) =>
      hasText(node.ownRow?.id) || (!node.ownRow && hasText(node.inheritedRow?.id));

    const branches = tree.filter(node => node.scope.id !== ROOT_SCOPE_ID);
    return {
      total: branches.length,
      own: branches.filter(node => hasText(node.ownRow?.id)).length,
      inherited: branches.filter(node => !node.ownRow && hasText(node.inheritedRow?.id)).length,
      mute: branches.filter(node => !answers(node)).length,
      answersNowhere: tree.length > 0 && tree.every(node => !answers(node)),
    };
  }, [tree, responses]);

  async function handleWriteOwn(node: QuestionTreeNode) {
    // Se clona el ancestro más cercano que responde: mismas palabras clave,
    // misma prioridad. Si nadie responde todavía, se parte de valores
    // seguros en vez de bloquear la acción.
    let ancestorId: string | null = node.scope.parent_id;
    const byId = new Map(scopes.map(s => [s.id, s]));
    let template: IntentConfiguration | null = null;
    while (ancestorId && !template) {
      template = rows.find(row => row.scope_id === ancestorId && row.is_active) || null;
      ancestorId = byId.get(ancestorId)?.parent_id ?? null;
    }

    try {
      setBusyScopeId(node.scope.id);
      const created = await intentConfigRepositoryClient.create({
        intent_name: intentName,
        display_name: template?.display_name || displayName,
        keywords: template?.keywords || [],
        synonyms: template?.synonyms || [],
        typos: template?.typos || [],
        phrases: template?.phrases || [],
        min_confidence: template?.min_confidence ?? 0.6,
        priority: template?.priority ?? 0,
        response_template: template?.response_template ?? null,
        response_type: template?.response_type || 'text',
        is_active: true,
        is_checkpoint: template?.is_checkpoint ?? false,
        is_strong_signal: template?.is_strong_signal ?? false,
        scope_id: node.scope.id,
      });
      router.push(`/intents/${created.id}/responses`);
    } catch (err) {
      console.error('Error creating own response:', err);
      setMessage('No fue posible crear la respuesta propia');
      setBusyScopeId(null);
    }
  }

  /**
   * La fila propia del alcance, activa o archivada. El runtime solo ve la
   * activa; la pantalla tiene que poder actuar sobre las dos.
   */
  function rowOf(node: QuestionTreeNode): IntentConfiguration | null {
    return node.ownRow || node.archivedRow;
  }

  async function handleDeleteOwn(node: QuestionTreeNode) {
    const row = rowOf(node);
    if (!row) return;
    const orphaned = countOrphanedByDeleting(node.scope, scopes, rows);
    const warning = orphaned > 0
      ? `Esta es la respuesta de la que heredan otros ${orphaned} alcance${orphaned === 1 ? '' : 's'}: se quedarán sin respuesta. `
      : '';
    if (!confirm(`${warning}¿Borrar la respuesta propia de "${node.scope.name}" y volver a heredar?`)) return;

    try {
      setBusyScopeId(node.scope.id);
      await intentConfigRepositoryClient.deleteOwnResponse(row.id);
      await loadData();
    } catch (err) {
      console.error('Error deleting own response:', err);
      setMessage('No fue posible borrar la respuesta propia');
    } finally {
      setBusyScopeId(null);
    }
  }

  async function handleToggleArchive(node: QuestionTreeNode) {
    const row = rowOf(node);
    if (!row) return;
    const action = row.is_active ? 'archivar' : 'restaurar';
    if (!confirm(`¿${action === 'archivar' ? 'Archivar' : 'Restaurar'} la respuesta de "${node.scope.name}"?`)) return;

    try {
      setBusyScopeId(node.scope.id);
      await intentConfigRepositoryClient.update(row.id, { is_active: !row.is_active });
      await loadData();
    } catch (err) {
      console.error('Error toggling archive:', err);
      setMessage(`No fue posible ${action} la respuesta`);
    } finally {
      setBusyScopeId(null);
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/intents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
          <p className="text-sm text-muted-foreground">{intentName}</p>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{message}</div>
      )}

      {!loading && coverage.answersNowhere && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          El bot reconoce esta pregunta y no tiene ninguna respuesta que dar: quien la haga recibe
          el mensaje de cuando no entiende. Escribe al menos la del negocio.
        </p>
      )}

      {!loading && !coverage.answersNowhere && coverage.total > 0 && (
        <p className="text-sm text-muted-foreground">
          {coverage.own === coverage.total
            ? `Los ${coverage.total} tienen su propia respuesta.`
            : [
                `${coverage.own} de ${coverage.total} con respuesta propia`,
                coverage.inherited > 0 ? `${coverage.inherited} leen la del negocio` : null,
                coverage.mute > 0 ? `${coverage.mute} sin nada que contestar` : null,
              ].filter(Boolean).join(' · ')}
        </p>
      )}

      {loading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-16 bg-muted rounded" />
          <div className="h-16 bg-muted rounded" />
        </div>
      ) : (
        <div className="space-y-2">
          {tree.map(node => {
            const row = node.ownRow || node.archivedRow;
            const nodeResponses = row
              ? responses.filter(response => response.intent_id === row.id)
              : [];
            const inheritedResponses = node.inheritedRow
              ? responses.filter(response => response.intent_id === node.inheritedRow!.id)
              : [];
            const isBusy = busyScopeId === node.scope.id;

            return (
              <Card key={node.scope.id} style={{ marginLeft: node.depth * 24 }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{node.scope.name}</span>
                        {node.ownRow ? (
                          nodeResponses.length > 0
                            ? <Badge variant="default">Propia</Badge>
                            : <Badge variant="destructive">Propia, vacía</Badge>
                        ) : node.inheritedFromName ? (
                          <Badge variant="secondary">Lee la de {node.inheritedFromName}</Badge>
                        ) : (
                          <Badge variant="destructive">Sin respuesta</Badge>
                        )}
                        {/* Archivada y heredando a la vez: el bot contesta la
                            del ancestro, y esta sigue guardada por si se
                            restaura. */}
                        {node.archivedRow && (
                          <Badge variant="outline">Propia archivada</Badge>
                        )}
                      </div>

                      {/* Lo que el lead lee aqui hoy, aunque no sea suyo.
                          Sin esto la pantalla decia de quien hereda pero no
                          que texto sale, que es lo unico que importa. */}
                      {!row && inheritedResponses.length > 0 && (
                        <div className="space-y-1 border-l-2 pl-3">
                          <p className="text-xs text-muted-foreground">
                            Hoy el cliente lee aquí la respuesta de {node.inheritedFromName}:
                          </p>
                          {inheritedResponses.map(response => (
                            <p key={response.id} className="text-sm italic text-muted-foreground">
                              {describeResponse(response)}
                            </p>
                          ))}
                        </div>
                      )}

                      {!row && inheritedResponses.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Nadie contesta esto aquí: el cliente recibe el mensaje de cuando el bot no
                          entiende.
                        </p>
                      )}

                      {/* La fila existe y no tiene nada escrito. Se veia
                          igual que una llena --"Propia" y nada mas-- y es el
                          caso que mas duele: la pregunta se detecta, no hay
                          nada que mandar, y el cliente recibe "no entiendo tu
                          pregunta" por algo que si sabe reconocer. */}
                      {node.ownRow && nodeResponses.length === 0 && (
                        <p className="text-sm text-destructive">
                          Esta respuesta está vacía: el bot reconoce la pregunta y no tiene nada que
                          contestar, así que el cliente recibe el mensaje de cuando no entiende.
                        </p>
                      )}

                      {row && nodeResponses.length > 0 && (
                        <div className="space-y-1">
                          {nodeResponses.map(response => (
                            <div key={response.id} className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">{response.response_key}</Badge>
                              <Badge variant="outline" className="text-xs">
                                {response.origin === 'compiler' ? 'Compilada' : 'Manual'}
                              </Badge>
                              <span className="truncate max-w-md">{describeResponse(response)}</span>
                              {response.response_fact_dependencies?.map((dependency, index) => {
                                const fact = dependency.compiler_facts;
                                if (!fact) return null;
                                return (
                                  <a
                                    key={`${fact.material_id}-${fact.page_number}-${index}`}
                                    href={`/api/compiler/materials/${fact.material_id}#page=${fact.page_number}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline text-xs"
                                  >
                                    {fact.compiler_materials?.original_filename || 'documento'}, pág. {fact.page_number}
                                  </a>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {row ? (
                        <>
                          <Link href={`/intents/${row.id}/responses`}>
                            <Button variant="outline" size="sm" disabled={isBusy}>
                              <MessageSquare className="h-4 w-4 mr-1" /> Respuestas
                            </Button>
                          </Link>
                          {/* El vocabulario, la prioridad y el checkpoint se
                              editan aqui. Sin este enlace la pantalla queda
                              inalcanzable: es el unico sitio del panel que
                              lleva a ella. */}
                          <Link href={`/intents/${row.id}`}>
                            <Button variant="ghost" size="sm" disabled={isBusy} title="Editar vocabulario y prioridad">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleArchive(node)}
                            disabled={isBusy}
                            title={row.is_active ? 'Archivar' : 'Restaurar'}
                          >
                            {row.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteOwn(node)}
                            disabled={isBusy}
                            title="Borrar y volver a heredar"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleWriteOwn(node)}
                          disabled={isBusy}
                        >
                          {isBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                          Crear la respuesta de {node.scope.name}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
