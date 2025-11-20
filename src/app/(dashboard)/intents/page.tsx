/**
 * Página de Lista de Intenciones
 * Muestra todas las intenciones configuradas del bot
 */

'use client';

import { useState, useEffect } from 'react';
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
import { Search, RefreshCw, Archive, ArchiveRestore, Edit, MessageSquare } from 'lucide-react';

export default function IntentsPage() {
  const [intents, setIntents] = useState<IntentConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    loadIntents();
  }, []);

  async function loadIntents() {
    try {
      setLoading(true);
      const data = await intentConfigRepositoryClient.getAll();
      setIntents(data);
    } catch (err) {
      console.error('Error loading intents:', err);
      setError('Error al cargar intenciones');
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive(id: string, currentStatus: boolean) {
    const action = currentStatus ? 'archivar' : 'restaurar';
    if (!confirm(`¿Estás seguro de ${action} esta intención?`)) return;

    try {
      await intentConfigRepositoryClient.update(id, { is_active: !currentStatus });
      await loadIntents();
    } catch (err) {
      console.error('Error updating intent:', err);
      alert(`Error al ${action} intención`);
    }
  }

  const filteredIntents = intents
    .filter(intent => showArchived ? !intent.is_active : intent.is_active)
    .filter(intent => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        intent.display_name.toLowerCase().includes(search) ||
        intent.intent_name.toLowerCase().includes(search) ||
        intent.keywords.some(k => k.toLowerCase().includes(search))
      );
    });

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Error al cargar intenciones: {error}
        </div>
      </div>
    );
  }

  const activeCount = intents.filter(i => i.is_active).length;
  const archivedCount = intents.filter(i => !i.is_active).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Intenciones del Bot
          </h1>
          <p className="text-muted-foreground mt-1">
            {activeCount} activas · {archivedCount} archivadas
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
          <Link href="/intents/new">
            <Button size="sm">
              Nueva Intención
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
                Archivados ({archivedCount})
              </>
            ) : (
              <>
                Activos ({activeCount})
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
              <TableHead>Nombre</TableHead>
              <TableHead>Checkpoint</TableHead>
              <TableHead className="text-center">Prioridad</TableHead>
              <TableHead>Keywords</TableHead>
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
            ) : filteredIntents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {showArchived ? 'No hay intenciones archivadas' : 'No se encontraron intenciones'}
                </TableCell>
              </TableRow>
            ) : (
              filteredIntents.map((intent) => (
                <TableRow key={intent.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{intent.display_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {intent.intent_name}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {intent.is_checkpoint ? (
                      <Badge variant="secondary">Checkpoint</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{intent.priority}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {intent.keywords.slice(0, 3).join(', ')}
                      {intent.keywords.length > 3 && (
                        <span className="text-muted-foreground">
                          {' '}+{intent.keywords.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/intents/${intent.id}`}>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/intents/${intent.id}/responses`}>
                        <Button variant="ghost" size="sm">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchive(intent.id, intent.is_active)}
                        title={intent.is_active ? 'Archivar' : 'Restaurar'}
                      >
                        {intent.is_active ? (
                          <Archive className="h-4 w-4" />
                        ) : (
                          <ArchiveRestore className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
