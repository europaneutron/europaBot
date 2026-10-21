import { supabaseServer } from '@/services/supabase/server-client';
import { scopeRepository, ROOT_SCOPE_ID } from './scope.repository';

interface SeedResponse {
  intentName: string;
  text: string;
}

const KEYWORDS: Record<string, string[]> = {
  precio: ['precio', 'precios', 'cuesta', 'cuestan', 'costo', 'vale', 'valen'],
  ubicacion: ['ubicacion', 'donde', 'direccion', 'ubicado', 'queda'],
  seguridad: ['seguridad', 'amenidades', 'vigilancia', 'alberca'],
  modelo: ['modelo', 'modelos', 'casas', 'tipos'],
  cita: ['agendar', 'visita', 'cita', 'visitar'],
};

/** Exclusivo de scripts locales: conserva los identificadores para deshacer una siembra parcial. */
export class FymsaFixtureRepository {
  private createdScopes: string[] = [];
  private createdIntents: string[] = [];
  private deactivated: string[] = [];
  private deactivatedRootIntents: string[] = [];

  constructor(private readonly suffix: string) {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    if (!['http:', 'https:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('La fixture FYMSA solo puede modificar Supabase local.');
    }
  }

  async prepare() {
    // Los desarrollos que ya existen enturbian la lista que el bot ofrece.
    const { data: existing, error: scopesError } = await supabaseServer
      .from('scopes').select('id').eq('parent_id', ROOT_SCOPE_ID).eq('is_active', true);
    if (scopesError) throw scopesError;
    for (const row of existing || []) {
      this.deactivated.push(row.id);
      const { error } = await supabaseServer.from('scopes').update({ is_active: false }).eq('id', row.id);
      if (error) throw error;
    }

    // Contenido suelto en la raíz de corridas anteriores del compilador
    // también enturbia la conversación: el nuevo "afirma lo cierto antes de
    // preguntar" (spec `enumerated-disambiguation`) sí lo resuelve, donde el
    // flujo viejo nunca lo tocaba. Solo para las intenciones que este guion
    // vuelve a sembrar por alcance: `modelo` y `cita` se dejan tal cual,
    // porque esta simulación depende de que sigan resolviendo por herencia
    // global en vez de resembrarlas.
    const RESEEDED_INTENT_NAMES = ['precio', 'ubicacion', 'seguridad'];
    const { data: staleRootIntents, error: intentsError } = await supabaseServer
      .from('intent_configurations')
      .select('id')
      .eq('scope_id', ROOT_SCOPE_ID)
      .in('intent_name', RESEEDED_INTENT_NAMES)
      .eq('is_active', true);
    if (intentsError) throw intentsError;
    for (const row of staleRootIntents || []) {
      this.deactivatedRootIntents.push(row.id);
      const { error } = await supabaseServer.from('intent_configurations').update({ is_active: false }).eq('id', row.id);
      if (error) throw error;
    }

    scopeRepository.invalidateCache(supabaseServer);
  }

  async scope(name: string, parentId: string, type: string, aliases: string[]) {
    const { data, error } = await supabaseServer.from('scopes').insert({
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${this.suffix}`,
      parent_id: parentId,
      scope_type: type,
    }).select('*').single();
    if (error) throw error;
    this.createdScopes.push(data.id);
    for (const alias of aliases) {
      const { error: aliasError } = await supabaseServer.from('scope_aliases').insert({
        scope_id: data.id,
        alias,
        normalized_alias: alias.toLowerCase(),
      });
      if (aliasError) throw aliasError;
    }
    return data.id as string;
  }

  async content(scopeId: string, rows: SeedResponse[]) {
    for (const row of rows) {
      const { data: intent, error } = await supabaseServer.from('intent_configurations').insert({
        intent_name: row.intentName,
        display_name: row.intentName,
        scope_id: scopeId,
        keywords: KEYWORDS[row.intentName] || [],
        synonyms: [],
        typos: [],
        phrases: [],
        priority: 10,
        is_active: true,
      }).select('*').single();
      if (error) throw error;
      this.createdIntents.push(intent.id);
      const { error: responseError } = await supabaseServer.from('bot_responses').insert({
        intent_id: intent.id,
        intent_name: row.intentName,
        response_key: 'main',
        response_type: 'simple',
        message_text: row.text,
        is_active: true,
        order_priority: 1,
      });
      if (responseError) throw responseError;
    }
  }

  async catalog(scopeId: string, values: Record<string, string | number>) {
    const { error } = await supabaseServer.from('catalog_values').insert(
      Object.entries(values).map(([valueKey, value]) => ({
        scope_id: scopeId,
        value_key: valueKey,
        value,
        value_type: typeof value === 'number' ? 'number' : 'text',
      }))
    );
    if (error) throw error;
  }

  async getSimulationUserId(phone: string): Promise<string> {
    const { data, error } = await supabaseServer.from('users')
      .select('id').eq('phone_number', phone).single();
    if (error) throw error;
    return data.id;
  }

  async getSimulationFocus(userId: string) {
    const { data: session, error } = await supabaseServer.from('user_sessions')
      .select('current_scope_id, pending_scope_message').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    const { data: scope, error: scopeError } = session?.current_scope_id
      ? await supabaseServer.from('scopes').select('name').eq('id', session.current_scope_id).maybeSingle()
      : { data: null, error: null };
    if (scopeError) throw scopeError;
    return { focusName: scope?.name, pendingScopeMessage: session?.pending_scope_message };
  }

  async restore(phone?: string): Promise<void> {
    const errors: unknown[] = [];
    // Un fallo de limpieza no debe impedir reactivar el contenido que ya existía.
    const attempt = async (operation: () => PromiseLike<{ error: unknown }>) => {
      try {
        const { error } = await operation();
        if (error) errors.push(error);
      } catch (error) {
        errors.push(error);
      }
    };
    if (phone) {
      await attempt(async () => {
        const { data: user, error } = await supabaseServer.from('users')
          .select('id').eq('phone_number', phone).maybeSingle();
        if (error) return { error };
        if (user) {
          for (const table of ['conversations', 'user_scope_progress', 'appointments',
            'scheduled_followups', 'user_sessions']) {
            await attempt(() => supabaseServer.from(table).delete().eq('user_id', user.id));
          }
          await attempt(() => supabaseServer.from('users').delete().eq('id', user.id));
        }
        return { error: null };
      });
    }
    for (const intentId of this.createdIntents) {
      await attempt(() => supabaseServer.from('bot_responses').delete().eq('intent_id', intentId));
      await attempt(() => supabaseServer.from('intent_configurations').delete().eq('id', intentId));
    }
    for (const scopeId of [...this.createdScopes].reverse()) {
      await attempt(() => supabaseServer.from('catalog_values').delete().eq('scope_id', scopeId));
      await attempt(() => supabaseServer.from('scope_aliases').delete().eq('scope_id', scopeId));
      await attempt(() => supabaseServer.from('scopes').delete().eq('id', scopeId));
    }
    for (const scopeId of this.deactivated) {
      await attempt(() => supabaseServer.from('scopes').update({ is_active: true }).eq('id', scopeId));
    }
    for (const intentId of this.deactivatedRootIntents) {
      await attempt(() => supabaseServer.from('intent_configurations').update({ is_active: true }).eq('id', intentId));
    }
    scopeRepository.invalidateCache(supabaseServer);
    if (errors.length) throw new AggregateError(errors, 'La restauración de FYMSA tuvo errores; revisa sus causas.');
  }
}
