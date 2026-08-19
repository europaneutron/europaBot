/**
 * Los fraccionamientos del negocio.
 *
 * El árbol completo, con el negocio arriba y cada desarrollo colgando. Se dan
 * de alta escribiendo el nombre: hasta ahora solo nacían del compilador, así
 * que empezar a mano era imposible.
 *
 * Los alias son parte del alta, no un extra: son las formas en que el lead
 * nombra el sitio. Sin "Europa", quien escribe "Europa" no llega a "Europa
 * Residencial".
 */

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Check, X, Pencil, Power } from 'lucide-react';

interface ScopeRow {
  id: string;
  parent_id: string | null;
  name: string;
  scope_type: string;
  is_active: boolean;
  aliases: string[];
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No fue posible cargar');
  return body;
};

export default function ScopesPage() {
  const { data, error, mutate } = useSWR('/api/scopes', fetcher);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAliases, setEditAliases] = useState('');

  const scopes: ScopeRow[] = data?.scopes || [];
  const rootScopeId: string = data?.rootScopeId || '';
  const root = scopes.find(scope => scope.id === rootScopeId);
  const children = scopes
    .filter(scope => scope.parent_id === rootScopeId)
    .sort((a, b) => a.name.localeCompare(b.name));

  async function send(url: string, method: string, body: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No fue posible guardar');
      await mutate();
      return true;
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No fue posible guardar');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createScope() {
    const created = await send('/api/scopes', 'POST', {
      name: newName,
      aliases: newAliases.split(',').map(value => value.trim()).filter(Boolean),
    });
    if (created) {
      setNewName('');
      setNewAliases('');
    }
  }

  function startEditing(scope: ScopeRow) {
    setEditingId(scope.id);
    setEditName(scope.name);
    setEditAliases(scope.aliases.join(', '));
  }

  async function saveEditing(scope: ScopeRow) {
    const saved = await send(`/api/scopes/${scope.id}`, 'PATCH', {
      name: editName,
      aliases: editAliases.split(',').map(value => value.trim()).filter(Boolean),
    });
    if (saved) setEditingId(null);
  }

  function renderScope(scope: ScopeRow, depth: number) {
    const isEditing = editingId === scope.id;
    return (
      <Card key={scope.id} style={{ marginLeft: depth * 24 }} className={scope.is_active ? '' : 'opacity-60'}>
        <CardContent className="p-4 space-y-3">
          {isEditing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor={`name-${scope.id}`}>Nombre</Label>
                <Input id={`name-${scope.id}`} value={editName} onChange={event => setEditName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`aliases-${scope.id}`}>Cómo lo nombra el lead, separado por comas</Label>
                <Input id={`aliases-${scope.id}`} value={editAliases} onChange={event => setEditAliases(event.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => saveEditing(scope)}>
                  <Check className="mr-1 h-4 w-4" /> Guardar
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                  <X className="mr-1 h-4 w-4" /> Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{scope.name}</span>
                  {scope.id === rootScopeId ? <Badge variant="secondary">El negocio</Badge> : null}
                  {scope.is_active ? null : <Badge variant="outline">Apagado</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {scope.aliases.length > 0
                    ? `El lead puede escribir: ${scope.aliases.join(', ')}`
                    : 'Sin formas alternativas de nombrarlo'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => startEditing(scope)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {scope.id === rootScopeId ? null : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    title={scope.is_active ? 'Apagar: deja de responder' : 'Encender'}
                    onClick={() => send(`/api/scopes/${scope.id}`, 'PATCH', { isActive: !scope.is_active })}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return <div className="p-6 text-destructive">{error.message}</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fraccionamientos</h1>
        <p className="text-muted-foreground mt-1">
          Lo que el bot puede vender. Cada uno responde lo suyo y hereda del negocio lo que no cambia.
        </p>
      </div>

      {message ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{message}</div>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Dar de alta uno nuevo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-name">Nombre</Label>
              <Input id="new-name" value={newName} onChange={event => setNewName(event.target.value)} placeholder="Europa Residencial" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-aliases">Cómo lo nombra el lead</Label>
              <Input id="new-aliases" value={newAliases} onChange={event => setNewAliases(event.target.value)} placeholder="Europa, el de Nacajuca" />
            </div>
          </div>
          <Button disabled={busy || newName.trim().length < 2} onClick={createScope}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Agregar
          </Button>
        </CardContent>
      </Card>

      {!data ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {root ? renderScope(root, 0) : null}
          {children.map(scope => renderScope(scope, 1))}
          {children.length === 0 ? (
            <p className="px-1 py-6 text-sm text-muted-foreground">
              Todavía no hay ningún fraccionamiento. Agrega el primero arriba.
            </p>
          ) : null}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Con los fraccionamientos dados de alta, el siguiente paso son sus datos en{' '}
        <Link href="/catalog" className="text-primary hover:underline">Catálogo</Link>{' '}
        y sus respuestas en{' '}
        <Link href="/intents" className="text-primary hover:underline">Preguntas</Link>.
      </p>
    </div>
  );
}
