/**
 * Hook para gestionar solicitudes de asesor
 * Obtiene y filtra advisor_requests con datos relacionados
 */

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase/client';

export interface AdvisorRequest {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  checkpoints_completed: number | null;
  lead_score: number | null;
  contacted: boolean;
  user: {
    name: string | null;
    phone_number: string;
    lead_status: string | null;
  };
}

export interface AdvisorRequestFilters {
  status?: 'contacted' | 'pending';
  searchTerm?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useAdvisorRequests(filters: AdvisorRequestFilters = {}) {
  const [requests, setRequests] = useState<AdvisorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, [JSON.stringify(filters)]);

  async function fetchRequests() {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('advisor_requests')
        .select(`
          id,
          user_id,
          status,
          created_at,
          checkpoints_completed,
          lead_score,
          contacted,
          user:users!user_id (
            name,
            phone_number,
            lead_status
          )
        `)
        .order('created_at', { ascending: false });

      // Filtro por estado contactado
      if (filters.status === 'contacted') {
        query = query.eq('contacted', true);
      } else if (filters.status === 'pending') {
        query = query.eq('contacted', false);
      }

      // Filtro por fecha
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      let results = data || [];

      // Filtro por búsqueda (nombre o teléfono)
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        results = results.filter((req: any) => {
          const userData = Array.isArray(req.user) ? req.user[0] : req.user;
          const name = userData?.name?.toLowerCase() || '';
          const phone = userData?.phone_number?.toLowerCase() || '';
          return name.includes(term) || phone.includes(term);
        });
      }

      // Normalizar user (de array a objeto)
      const normalized = results.map((req: any) => ({
        ...req,
        user: Array.isArray(req.user) ? req.user[0] : req.user,
      }));

      setRequests(normalized);
    } catch (err) {
      console.error('Error fetching advisor requests:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  async function toggleContacted(requestId: string, contacted: boolean) {
    try {
      const { error: updateError } = await supabase
        .from('advisor_requests')
        .update({ contacted })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Actualizar estado local
      setRequests((prev) =>
        prev.map((req) =>
          req.id === requestId ? { ...req, contacted } : req
        )
      );
    } catch (err) {
      console.error('Error updating contacted status:', err);
      throw err;
    }
  }

  return {
    requests,
    loading,
    error,
    toggleContacted,
    refetch: fetchRequests,
  };
}
