import { supabaseServer } from '@/services/supabase/server-client';
import { scopeRepository } from '@/data/repositories/scope.repository';

export interface Resource {
  id: string;
  scope_id: string | null;
  resource_type: string;
  intent_category: string | null;
  title: string;
  description: string | null;
  file_path: string | null;
  file_url: string | null;
  external_url: string | null;
  file_size: number | null;
  mime_type: string | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export class ResourceRepository {
  async getVisible(scopeId?: string | null): Promise<Resource[]> {
    const { data, error } = await supabaseServer
      .from('resources')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('Error loading resources:', error);
      throw error;
    }

    // Los recursos sin categoría se tratan como un conjunto propio, y por tanto
    // se sustituyen igual que cualquier otro: si un alcance define material
    // general, reemplaza el material general heredado en lugar de sumarse a él.
    // Es la misma regla que rige al resto de la herencia —un alcance sustituye
    // el conjunto de su ancestro, no lo mezcla— y evita que un desarrollo
    // envíe material de otro por no haberlo categorizado.
    return scopeRepository.resolveRowSets<Resource>(
      data || [],
      scopeId,
      resource => resource.intent_category || '__uncategorized__'
    );
  }
}

export const resourceRepository = new ResourceRepository();
