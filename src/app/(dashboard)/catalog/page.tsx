'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Check, Database, ExternalLink, Pencil, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';

async function fetcher(url: string) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No fue posible cargar el catálogo');
  return body;
}

export default function CatalogPage() {
  const [scopeId, setScopeId] = useState(ROOT_SCOPE_ID);
  const { data, error, isLoading, mutate } = useSWR(
    `/api/catalog-values?scopeId=${encodeURIComponent(scopeId)}`,
    fetcher
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectableScopes = useMemo(
    () => (data?.scopes || []).filter((scope: any) => scope.scope_type === 'root' || scope.parent_id === ROOT_SCOPE_ID),
    [data]
  );

  async function save(row: any) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/catalog-values/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: draft, valueType: row.value_type, unit: row.unit }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setEditingId(null);
      setMessage('Valor actualizado. El bot lo usará en el siguiente mensaje.');
      await mutate();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : 'No fue posible guardar el valor');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Database className="h-7 w-7" /> Catálogo
        </h1>
        <p className="text-muted-foreground">
          Edita precios y datos comerciales sin volver a compilar el material.
        </p>
      </header>

      {message ? <div className="rounded-md border bg-muted p-3 text-sm">{message}</div> : null}
      {error ? <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error.message}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Valores por alcance</CardTitle>
          <CardDescription>Se muestran los valores propios y los de todos sus descendientes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={scopeId} onValueChange={setScopeId}>
            <SelectTrigger className="max-w-sm" aria-label="Seleccionar alcance">
              <SelectValue placeholder="Selecciona un alcance" />
            </SelectTrigger>
            <SelectContent>
              {selectableScopes.map((scope: any) => (
                <SelectItem key={scope.id} value={scope.id}>{scope.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alcance</TableHead>
                  <TableHead>Dato</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Procedencia</TableHead>
                  <TableHead className="w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.values || []).map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.scopes?.name || 'Sin nombre'}</TableCell>
                    <TableCell><code>{row.value_key}</code></TableCell>
                    <TableCell className="min-w-56">
                      {editingId === row.id ? (
                        <Input
                          value={draft}
                          onChange={event => setDraft(event.target.value)}
                          aria-label={`Editar ${row.value_key}`}
                          disabled={saving}
                        />
                      ) : String(row.value)}
                    </TableCell>
                    <TableCell>{row.value_type}{row.unit ? ` · ${row.unit}` : ''}</TableCell>
                    <TableCell className="min-w-64 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        {row.edited_by_human ? <Badge variant="secondary">Editado a mano</Badge> : null}
                        {row.compiler_materials?.original_filename ? (
                          <a
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            href={`/api/compiler/materials/${row.source_material_id}#page=${row.source_page_number}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {row.compiler_materials.original_filename}, página {row.source_page_number}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : <span className="text-muted-foreground">Sin documento asociado</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {editingId === row.id ? (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => save(row)} disabled={saving} aria-label="Guardar valor">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} disabled={saving} aria-label="Cancelar edición">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setEditingId(row.id); setDraft(String(row.value)); setMessage(null); }}
                          aria-label={`Editar ${row.value_key}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && (data?.values || []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Este alcance todavía no tiene valores publicados.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
