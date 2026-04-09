/**
 * Página de lista de conversaciones con filtros (shadcn/ui)
 * Ruta: /conversations
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useConversations, ConversationFilters, CONVERSATIONS_PAGE_SIZE } from '@/hooks/use-conversations';
import { exportToCSV, generateCSVFilename } from '@/lib/utils/export-csv';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Search, X, Eye, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';

export default function ConversationsPage() {
  const [filters, setFilters] = useState<ConversationFilters>({});
  const [page, setPage] = useState(1);
  const { conversations, loading, error, total } = useConversations(filters, page, CONVERSATIONS_PAGE_SIZE);

  const totalPages = Math.max(1, Math.ceil(total / CONVERSATIONS_PAGE_SIZE));

  // Resetear a pagina 1 cuando cambian los filtros
  useEffect(() => {
    setPage(1);
  }, [filters]);

  const handleFilterChange = (key: keyof ConversationFilters, value: any) => {
    setFilters((prev: ConversationFilters) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  function handleExportCSV() {
    exportToCSV(
      conversations,
      [
        { key: 'user_name', header: 'Nombre' },
        { key: 'user_phone', header: 'Teléfono' },
        { key: 'lead_status', header: 'Lead Status' },
        { key: 'lead_score', header: 'Score' },
        { key: 'last_intent', header: 'Última Intención' },
        {
          key: 'last_message_time',
          header: 'Última Interacción',
          format: (val: any) => new Date(val).toLocaleString('es-MX'),
        },
        {
          key: 'has_appointment',
          header: 'Tiene Cita',
          format: (val: any) => (val ? 'Sí' : 'No'),
        },
        {
          key: 'appointment_date',
          header: 'Fecha Cita',
          format: (val: any) => (val ? new Date(val).toLocaleString('es-MX') : ''),
        },
        { key: 'last_message', header: 'Último Mensaje' },
        { key: 'message_count', header: 'Total Mensajes' },
      ],
      generateCSVFilename('conversaciones')
    );
  }

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Conversaciones</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona y revisa todas las conversaciones del bot
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Refina la búsqueda de conversaciones</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Búsqueda */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Teléfono o nombre..."
                  className="pl-8"
                  value={filters.searchQuery || ''}
                  onChange={(e) => handleFilterChange('searchQuery', e.target.value || undefined)}
                />
              </div>
            </div>

            {/* Lead Status */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado de Lead</label>
              <Select
                value={filters.leadStatus || 'all'}
                onValueChange={(value) => handleFilterChange('leadStatus', value === 'all' ? undefined : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="cold">COLD</SelectItem>
                  <SelectItem value="warm">WARM</SelectItem>
                  <SelectItem value="hot">HOT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tiene Cita */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Citas</label>
              <Select
                value={filters.hasAppointment === undefined ? 'all' : filters.hasAppointment ? 'true' : 'false'}
                onValueChange={(value) => {
                  handleFilterChange(
                    'hasAppointment',
                    value === 'all' ? undefined : value === 'true'
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Con cita</SelectItem>
                  <SelectItem value="false">Sin cita</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Fecha */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha desde</label>
              <Input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => handleFilterChange('startDate', e.target.value || undefined)}
              />
            </div>
          </div>

          {/* Botón limpiar filtros */}
          {hasActiveFilters && (
            <div className="mt-4">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Limpiar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de conversaciones */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{total} conversaciones</CardTitle>
              <CardDescription>
                {totalPages > 1
                  ? `Pagina ${page} de ${totalPages}`
                  : 'Historial de interacciones con usuarios'}
              </CardDescription>
            </div>
            <Button
              onClick={handleExportCSV}
              variant="outline"
              size="sm"
              disabled={conversations.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              Cargando conversaciones...
            </div>
          ) : error ? (
            <div className="py-8 text-center text-destructive">
              {error}
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No se encontraron conversaciones
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Lead Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Mensajes</TableHead>
                    <TableHead>Último mensaje</TableHead>
                    <TableHead className="text-center">Cita</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversations.map((conv: any) => (
                    <TableRow key={conv.user_id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {conv.user_name || 'Sin nombre'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {conv.user_phone}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <LeadBadge status={conv.lead_status} />
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${
                          conv.lead_score >= 70 ? 'text-red-600' :
                          conv.lead_score >= 40 ? 'text-orange-600' :
                          'text-blue-600'
                        }`}>
                          {conv.lead_score}
                        </span>
                      </TableCell>
                      <TableCell>{conv.message_count}</TableCell>
                      <TableCell>
                        <div className="max-w-xs">
                          <div className="text-sm truncate">
                            {conv.last_message}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(conv.last_message_time).toLocaleString('es-ES')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {conv.has_appointment ? (
                          <div className="flex items-center justify-center gap-1">
                            <CalendarCheck className="h-4 w-4 text-green-600" />
                            <span className="text-xs text-muted-foreground">
                              {conv.appointment_date ? new Date(conv.appointment_date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/conversations/${conv.user_id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Controles de paginacion */}
          {!loading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {`${(page - 1) * CONVERSATIONS_PAGE_SIZE + 1}–${Math.min(page * CONVERSATIONS_PAGE_SIZE, total)} de ${total}`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-sm font-medium px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Badge para lead status con colores
 */
function LeadBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { className: string; label: string }> = {
    hot: { className: 'bg-red-100 text-red-700 border-red-200', label: 'HOT' },
    warm: { className: 'bg-orange-100 text-orange-700 border-orange-200', label: 'WARM' },
    cold: { className: 'bg-blue-100 text-blue-700 border-blue-200', label: 'COLD' },
  };

  const config = statusConfig[status] || statusConfig.cold;

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
