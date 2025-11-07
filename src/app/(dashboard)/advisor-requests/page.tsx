/**
 * Página: Solicitudes de Asesor
 * Visualización y gestión de advisor_requests con filtros y exportación CSV
 */

'use client';

import { useState } from 'react';
import {
  useAdvisorRequests,
  type AdvisorRequestFilters,
} from '@/hooks/use-advisor-requests';
import { exportToCSV, generateCSVFilename } from '@/lib/utils/export-csv';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import { Download, Search, RefreshCw } from 'lucide-react';

export default function AdvisorRequestsPage() {
  const [filters, setFilters] = useState<AdvisorRequestFilters>({});
  const [searchInput, setSearchInput] = useState('');

  const { requests, loading, error, toggleContacted, refetch } =
    useAdvisorRequests(filters);

  function handleSearch() {
    setFilters((prev) => ({ ...prev, searchTerm: searchInput }));
  }

  function handleExportCSV() {
    exportToCSV(
      requests,
      [
        { key: 'user.name', header: 'Nombre' },
        { key: 'user.phone_number', header: 'Teléfono' },
        {
          key: 'created_at',
          header: 'Fecha Solicitud',
          format: (val) => new Date(val).toLocaleString('es-MX'),
        },
        {
          key: 'checkpoints_at_request',
          header: 'Checkpoints',
          format: (val) => (Array.isArray(val) ? val.join('; ') : ''),
        },
        { key: 'lead_score', header: 'Score' },
        { key: 'lead_status', header: 'Lead Status' },
        {
          key: 'contacted',
          header: 'Contactado',
          format: (val) => (val ? 'Sí' : 'No'),
        },
      ],
      generateCSVFilename('solicitudes_asesor')
    );
  }

  async function handleToggleContacted(requestId: string, contacted: boolean) {
    try {
      await toggleContacted(requestId, contacted);
    } catch (err) {
      console.error('Error al actualizar estado:', err);
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Error al cargar solicitudes: {error}
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
            Solicitudes de Asesor
          </h1>
          <p className="text-muted-foreground mt-1">
            {requests.length} solicitudes encontradas
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={refetch}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Button
            onClick={handleExportCSV}
            variant="outline"
            size="sm"
            disabled={requests.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-2 block">Buscar</label>
          <div className="flex gap-2">
            <Input
              placeholder="Nombre o teléfono..."
              value={searchInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} size="sm">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="w-[180px]">
          <label className="text-sm font-medium mb-2 block">Estado</label>
          <Select
            value={filters.status || 'all'}
            onValueChange={(val: string) =>
              setFilters((prev) => ({
                ...prev,
                status: val === 'all' ? undefined : (val as 'contacted' | 'pending'),
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="contacted">Contactados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-[180px]">
          <label className="text-sm font-medium mb-2 block">Desde</label>
          <Input
            type="date"
            value={filters.dateFrom || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
            }
          />
        </div>

        <div className="w-[180px]">
          <label className="text-sm font-medium mb-2 block">Hasta</label>
          <Input
            type="date"
            value={filters.dateTo || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
            }
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Fecha Solicitud</TableHead>
              <TableHead>Checkpoints</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Lead Status</TableHead>
              <TableHead className="text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No hay solicitudes que coincidan con los filtros
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    {request.user?.name || 'Sin nombre'}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {request.user?.phone_number}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(request.created_at).toLocaleDateString('es-MX', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {Array.isArray(request.checkpoints_at_request) &&
                      request.checkpoints_at_request.length > 0 ? (
                        request.checkpoints_at_request.map((cp, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {cp}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Sin checkpoints
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        (request.lead_score || 0) >= 70
                          ? 'default'
                          : (request.lead_score || 0) >= 40
                          ? 'secondary'
                          : 'outline'
                      }
                    >
                      {request.lead_score || 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {request.lead_status || 'N/A'}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="sm"
                      variant={request.contacted ? 'default' : 'outline'}
                      onClick={() =>
                        handleToggleContacted(request.id, !request.contacted)
                      }
                    >
                      {request.contacted ? 'Contactado' : 'Pendiente'}
                    </Button>
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
