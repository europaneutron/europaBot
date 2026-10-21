import { scopeRepository, ROOT_SCOPE_ID } from './scope.repository';
import { catalogValueRepository, formatCatalogValueForProse } from './catalog-value.repository';
import { conversationRepository } from './conversation.repository';
import { resourceRepository } from './resource.repository';
import { appointmentRepository } from './appointment.repository';
import { configRepository } from './config.repository';
import { clientBrandRepository } from './client-brand.repository';
import { withContentVersionScope } from '@/lib/server/content-version-scope';

export const AI_PERSONA_KEYS = [
  'ai_persona_name', 'ai_persona_register', 'ai_persona_emojis',
  'ai_persona_length', 'ai_persona_notes',
];

/** Una carga por colección; la herencia se resuelve en memoria con las reglas existentes. */
export async function loadAiContextData() {
  return withContentVersionScope(async () => {
    // Esperar la primera carga evita consultas simultáneas del árbol con la caché fría.
    const allScopes = await scopeRepository.getScopes();
    const reachable = await scopeRepository.getReachableScopeIds();
    const scopes = allScopes.filter(scope => reachable.has(scope.id));
    const [allValues, allResponses, resources, persona, brand] = await Promise.all([
      catalogValueRepository.listAll(),
      conversationRepository.getContextResponseRows(),
      resourceRepository.listActive(),
      configRepository.getManyByScope(AI_PERSONA_KEYS, ROOT_SCOPE_ID),
      clientBrandRepository.get(),
    ]);
    // El orden de Postgres no está garantizado; estabiliza también las colisiones
    // de calificadores antes de interpolar, no solo el texto al final.
    const catalog = allValues.filter(row => reachable.has(row.scope_id)).sort((a, b) => {
      const left = a.scope_id + ':' + a.value_key;
      const right = b.scope_id + ':' + b.value_key;
      return left < right ? -1 : left > right ? 1 : 0;
    });
    const responses = allResponses.filter(row => row.scope_id === null || reachable.has(row.scope_id));
    const qualifiedVariables = await catalogValueRepository.getQualifiedVariables(undefined, catalog);
    const contents = await Promise.all(scopes.map(async scope => {
      const [values, visibleResources] = await Promise.all([
        scopeRepository.resolveRows(catalog, scope.id, row => row.value_key),
        resourceRepository.getVisible(scope.id, resources),
      ]);
      return {
        scope,
        variables: Object.fromEntries(values.map(row => [row.value_key, formatCatalogValueForProse(row)])),
        // La FAQ conserva la autoría: el desarrollo ya aporta su información
        // a los modelos por herencia, sin repetir sus respuestas en cada uno.
        responses: responses.filter(row => row.scope_id === scope.id),
        resources: visibleResources,
      };
    }));
    const appointmentScopeIds = (await Promise.all(scopes
      .filter(scope => scope.parent_id === ROOT_SCOPE_ID)
      .map(async scope => (await appointmentRepository.getTimeSlots(scope.id)).length ? scope.id : null)
    )).filter((id): id is string => id !== null);
    return { scopes, catalog, qualifiedVariables, contents, persona, brand, appointmentScopeIds };
  });
}

export type AiContextData = Awaited<ReturnType<typeof loadAiContextData>>;
