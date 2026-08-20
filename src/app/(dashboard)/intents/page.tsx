/**
 * Página de Lista de Preguntas
 *
 * Una fila por pregunta (`intent_name`), no por registro: una pregunta con
 * respuesta propia en seis alcances es una fila que dice "6 respuestas", no
 * seis filas idénticas. El árbol de alcances vive dentro de cada pregunta,
 * en /intents/q/<intentName>.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { intentConfigRepositoryClient, IntentConfiguration } from '@/data/repositories/intent-config.repository.client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, RefreshCw, Archive, ArchiveRestore, Trash2, Play, TriangleAlert, Loader2 } from 'lucide-react';
import { supabase } from '@/services/supabase/client';
import { reachableScopes, TreeScope } from '@/lib/question-tree';

const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';

interface QuestionRow {
  intentName: string;
  displayName: string;
  scopeCount: number;
  isCheckpoint: boolean;
  priority: number;
  searchText: string;
}

/**
 * `reachableIds` acota la cuenta a los alcances vivos, los mismos que el
 * árbol enseña al abrir la pregunta. Sin esto la fila decía "6 respuestas" y
 * el árbol enseñaba cuatro, porque dos vivían en alcances retirados por una
 * sustitución. `null` cuando los alcances no se pudieron leer: mejor contar
 * de más que esconder preguntas.
 */
function groupByQuestion(
  intents: IntentConfiguration[],
  reachableIds: Set<string> | null
): QuestionRow[] {
  const visible = reachableIds
    ? intents.filter(intent => intent.scope_id && reachableIds.has(intent.scope_id))
    : intents;
  const byName = new Map<string, IntentConfiguration[]>();
  for (const intent of visible) {
    const group = byName.get(intent.intent_name) || [];
    group.push(intent);
    byName.set(intent.intent_name, group);
  }

  return Array.from(byName.entries()).filter(([, group]) => group.length > 0).map(([intentName, group]) => {
    // El rótulo general manda cuando existe: es el que ve el lead que
    // todavía no llegó a un alcance concreto. Si nadie la responde ahí, la
    // de mayor prioridad es la mejor aproximación a "la" pregunta.
    const representative =
      group.find(intent => intent.scope_id === ROOT_SCOPE_ID) ||
      [...group].sort((a, b) => b.priority - a.priority)[0];

    return {
      intentName,
      displayName: representative.display_name,
      scopeCount: group.length,
      isCheckpoint: group.some(intent => intent.is_checkpoint),
      priority: Math.max(...group.map(intent => intent.priority)),
      searchText: [
        intentName,
        ...group.flatMap(intent => [intent.display_name, ...intent.keywords]),
      ].join(' ').toLowerCase(),
    };
  });
}

export default function IntentsPage() {
  const [intents, setIntents] = useState<IntentConfiguration[]>([]);
  const [scopes, setScopes] = useState<TreeScope[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [busyIntentName, setBusyIntentName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    intentName: string;
    displayName: string;
    impact: { scopes: number; responses: number } | null;
  } | null>(null);

  useEffect(() => {
    loadIntents();
  }, []);

  async function loadIntents() {
    try {
      setLoading(true);
      const [data, scopesResult] = await Promise.all([
        intentConfigRepositoryClient.getAll(),
        supabase.from('scopes').select('id, parent_id, name, is_active'),
      ]);
      setIntents(data);
      setScopes(scopesResult.error ? null : ((scopesResult.data || []) as TreeScope[]));
    } catch (err) {
      console.error('Error loading intents:', err);
      setError('Error al cargar intenciones');
    } finally {
      setLoading(false);
    }
  }

  const reachableIds = useMemo(
    () => (scopes ? new Set(reachableScopes(scopes).map(scope => scope.id)) : null),
    [scopes]
  );
  const activeQuestions = useMemo(
    () => groupByQuestion(intents.filter(intent => intent.is_active), reachableIds),
    [intents, reachableIds]
  );
  const archivedQuestions = useMemo(
    () => groupByQuestion(intents.filter(intent => !intent.is_active), reachableIds),
    [intents, reachableIds]
  );

  async function handleToggleArchiveGroup(question: QuestionRow, archive: boolean) {
    const action = archive ? 'archivar' : 'restaurar';
    if (!confirm(`¿${archive ? 'Archivar' : 'Restaurar'} "${question.displayName}" en los ${question.scopeCount} alcance${question.scopeCount === 1 ? '' : 's'} donde tiene fila?`)) return;

    try {
      setBusyIntentName(question.intentName);
      if (archive) await intentConfigRepositoryClient.archiveGroup(question.intentName);
      else await intentConfigRepositoryClient.restoreGroup(question.intentName);
      await loadIntents();
    } catch (err) {
      console.error(`Error trying to ${action} question group:`, err);
      setError(`No fue posible ${action} la pregunta`);
    } finally {
      setBusyIntentName(null);
    }
  }

  function handleDeleteGroup(question: QuestionRow) {
    setPendingDelete({ intentName: question.intentName, displayName: question.displayName, impact: null });
    intentConfigRepositoryClient.getGroupDeletionImpact(question.intentName)
      .then(impact => setPendingDelete(current => (current && current.intentName === question.intentName ? { ...current, impact } : current)))
      .catch(err => console.error('Error fetching group deletion impact:', err));
  }

  async function confirmDeleteGroup() {
    if (!pendingDelete) return;
    const { intentName } = pendingDelete;
    setPendingDelete(null);
    try {
      setBusyIntentName(intentName);
      await intentConfigRepositoryClient.deleteGroup(intentName);
      await loadIntents();
    } catch (err) {
      console.error('Error deleting question group:', err);
      setError('No fue posible eliminar la pregunta');
    } finally {
      setBusyIntentName(null);
    }
  }

  const questions = showArchived ? archivedQuestions : activeQuestions;
  // Una pregunta se encuentra una vez, no una vez por alcance: el filtro
  // corre sobre el texto ya agrupado, no sobre cada registro.
  const filteredQuestions = questions
    .filter(question => {
      if (!searchTerm) return true;
      return question.searchText.includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => b.priority - a.priority || a.displayName.localeCompare(b.displayName));

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Error al cargar intenciones: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Preguntas del Bot
          </h1>
          <p className="text-muted-foreground mt-1">
            {activeQuestions.length} preguntas activas · {archivedQuestions.length} archivadas
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={loadIntents}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Link href="/intents/probar">
            <Button variant="outline" size="sm">
              <Play className="h-4 w-4 mr-2" />
              Probar frases
            </Button>
          </Link>
          <Link href="/intents/new">
            <Button size="sm">
              Nueva pregunta
            </Button>
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-2 block">Buscar</label>
          <div className="flex gap-2">
            <Input
              placeholder="Nombre, keyword..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Button size="sm" variant="ghost">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Vista</label>
          <Button
            onClick={() => setShowArchived(!showArchived)}
            variant={showArchived ? 'default' : 'outline'}
            size="sm"
          >
            {showArchived ? (
              <>
                <Archive className="h-4 w-4 mr-2" />
                Archivadas ({archivedQuestions.length})
              </>
            ) : (
              <>
                Activas ({activeQuestions.length})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pregunta</TableHead>
              <TableHead>Checkpoint</TableHead>
              <TableHead className="text-center">Prioridad</TableHead>
              <TableHead>Respuestas por alcance</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Cargando...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredQuestions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {showArchived ? 'No hay preguntas archivadas' : 'No se encontraron preguntas'}
                </TableCell>
              </TableRow>
            ) : (
              filteredQuestions.map((question) => {
                const isBusy = busyIntentName === question.intentName;
                return (
                  <TableRow key={question.intentName} className="hover:bg-muted/50">
                    <TableCell>
                      <Link href={`/intents/q/${encodeURIComponent(question.intentName)}`} className="block">
                        <div className="font-medium">{question.displayName}</div>
                        <div className="text-sm text-muted-foreground">
                          {question.intentName}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {question.isCheckpoint ? (
                        <Badge variant="secondary">Checkpoint</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{question.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/intents/q/${encodeURIComponent(question.intentName)}`}>
                        <Badge variant="outline">
                          {question.scopeCount} {question.scopeCount === 1 ? 'respuesta' : 'respuestas'}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          title={showArchived ? 'Restaurar en todos los alcances' : 'Archivar en todos los alcances'}
                          onClick={() => handleToggleArchiveGroup(question, !showArchived)}
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : showArchived ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          title="Eliminar en todos los alcances"
                          onClick={() => handleDeleteGroup(question)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <TriangleAlert className="h-5 w-5" />
                Eliminar &quot;{pendingDelete.displayName}&quot;
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">Esto borrará permanentemente, en todos los alcances donde existe:</p>
              <ul className="text-sm list-disc pl-5 space-y-1">
                <li>
                  {pendingDelete.impact === null
                    ? 'Calculando...'
                    : `${pendingDelete.impact.scopes} fila${pendingDelete.impact.scopes === 1 ? '' : 's'} de alcance`}
                </li>
                {pendingDelete.impact !== null && (
                  <li>
                    {pendingDelete.impact.responses} respuesta{pendingDelete.impact.responses === 1 ? '' : 's'} configurada{pendingDelete.impact.responses === 1 ? '' : 's'}
                  </li>
                )}
              </ul>
              <p className="text-sm text-muted-foreground">
                El historial de conversaciones pasadas no se verá afectado.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPendingDelete(null)}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={confirmDeleteGroup} disabled={pendingDelete.impact === null}>
                  Eliminar definitivamente
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
