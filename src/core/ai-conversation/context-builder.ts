import { loadAiContextData, type AiContextData } from '@/data/repositories/ai-context.repository';
import { ROOT_SCOPE_ID } from '@/data/repositories/scope.repository';
import { formatCatalogValueForProse } from '@/data/repositories/catalog-value.repository';
import { interpolateMessage, toMessageVariables } from '@/lib/interpolate-message';

import type { AiDevelopment } from './tools';
import { collectCatalogMoneyAmounts, collectTextMoneyAmounts } from './guards/money-guard';
import { resolveBrochureDocuments } from './brochure';

export type ExclusionReason = 'navigation' | 'unresolved_variables' | 'template_marker' | 'empty';
export interface ExcludedResponse {
  responseId: string;
  scopePath: string;
  reason: ExclusionReason;
  missingKeys: string[];
}

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
// Cualquier texto entre corchetes es un hueco de plantilla, salvo un enlace markdown [texto](url).
const templateMarker = /\[[^\]\n]+\](?!\()|\$\s*X+(?:[,.]X+)*/;

/** Solo la prosa forma parte de la FAQ; botones y metadatos de envío no son conocimiento. */
function responseText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const row = value as Record<string, unknown>;
  if (Array.isArray(row.fragments)) {
    return row.fragments.map(fragment => {
      if (!fragment || typeof fragment !== 'object') return '';
      const item = fragment as Record<string, unknown>;
      if (item.type === 'text') return typeof item.content === 'string' ? item.content : '';
      // El archivo lo adjunta la herramienta de brochure; su pie no es conocimiento.
      if (item.type === 'document') return '';
      return typeof item.caption === 'string' ? item.caption : '';
    }).filter(Boolean).join('\n');
  }
  return typeof row.text === 'string' ? row.text : '';
}

export function buildPersona(config: Record<string, string>, businessName: string | null): string {
  const name = config.ai_persona_name?.trim();
  const notes = config.ai_persona_notes?.trim();
  return [
    '# Persona',
    `Eres el asistente de ${businessName?.trim() || 'este negocio'}.`,
    name ? `Te llamas ${name}.` : '',
    'Conversas con una persona interesada en una vivienda que lee en WhatsApp.',
    'Cada respuesta cierra con lo que sigue de forma natural en la conversación: un dato relacionado o una pregunta sobre lo que la persona busca (tipo de vivienda, presupuesto, forma de pago).',
    config.ai_persona_register === 'usted' ? 'Hablas de usted.' : 'Hablas de tú.',
    config.ai_persona_emojis === 'si' ? 'Usas emojis para acompañar tus mensajes.'
      : config.ai_persona_emojis === 'no' ? 'Te expresas con palabras y signos de puntuación.'
        : 'Usas emojis con moderación, como un asesor por WhatsApp.',
    config.ai_persona_length === 'media' ? 'Respondes con una extensión media.'
      : 'Respondes de forma breve, con como máximo una pregunta.',
    notes ? `Notas de personalidad del negocio: ${notes}` : '',
    'Si te preguntan quién eres, explicas que eres el asistente del negocio y ofreces pasar la conversación con un asesor.',
  ].filter(Boolean).join('\n');
}

export function buildContextFromData(data: AiContextData) {
  const byId = new Map(data.scopes.map(scope => [scope.id, scope]));
  const path = (id: string): string => {
    const names: string[] = [];
    const visited = new Set<string>();
    let current = byId.get(id);
    while (current && current.id !== ROOT_SCOPE_ID) {
      if (visited.has(current.id)) throw new Error('El árbol de alcances contiene un ciclo');
      visited.add(current.id);
      names.unshift(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return names.join(' > ') || data.brand.business_name?.trim() || 'Negocio';
  };
  const scopes = [...data.scopes].sort((a, b) => compare(path(a.id), path(b.id)));
  const developments = scopes.filter(scope => scope.parent_id === ROOT_SCOPE_ID);
  const responsesAt = (scopeId: string) => data.contents.find(content => content.scope.id === scopeId)?.responses ?? [];
  const chainOf = (scope: { id: string; parent_id: string | null }): string[] => {
    const chain: string[] = [];
    const visited = new Set<string>();
    let current: typeof scope | undefined = scope;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.push(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return chain;
  };
  // El brochure puede ser un recurso visible o un documento dentro de una respuesta.
  const brochureFiles = new Map(developments.map(scope => {
    const resources = data.contents.find(content => content.scope.id === scope.id)?.resources ?? [];
    const documents = resolveBrochureDocuments(chainOf(scope), responsesAt);
    return [scope.id, [...resources.map(resource => resource.title), ...documents.map(document => document.filename)]] as const;
  }));
  const availableDevelopments: AiDevelopment[] = developments.map(scope => ({
    id: scope.id, name: scope.name,
    hasAppointments: data.appointmentScopeIds.includes(scope.id),
    hasResources: brochureFiles.get(scope.id)!.length > 0,
  }));
  const excluded: ExcludedResponse[] = [];
  const catalogLines = (ids: Set<string>) => data.catalog
    .filter(row => ids.has(row.scope_id))
    .map(row => `${path(row.scope_id)} > ${row.value_key}: ${formatCatalogValueForProse(row)}`)
    .sort(compare);
  const catalogBlocks = developments.map(development => {
    const ids = new Set<string>();
    for (const scope of scopes) {
      let current = scope;
      while (current.id !== development.id && current.parent_id && byId.has(current.parent_id)) {
        current = byId.get(current.parent_id)!;
      }
      if (current.id === development.id) ids.add(scope.id);
    }
    return {
      developmentName: development.name,
      text: [
        `## ${path(development.id)}`,
        ...catalogLines(new Set([development.id])),
        ...scopes.filter(scope => ids.has(scope.id) && scope.id !== development.id).flatMap(scope => [
          `### ${path(scope.id)}`, ...catalogLines(new Set([scope.id])),
        ]),
      ].join('\n'),
    };
  });
  const faq: string[] = [];
  for (const scope of scopes) {
    const content = data.contents.find(item => item.scope.id === scope.id);
    if (!content) continue;
    const entries: Array<{ text: string; priority: number }> = [];
    for (const row of content.responses) {
      // La procedencia evita duplicar FAQ aunque un consumidor entregue filas heredadas.
      if (row.scope_id !== scope.id) continue;
      const interpolation = interpolateMessage(responseText(row.message_text), {
        ...toMessageVariables(row.variables),
        ...data.qualifiedVariables,
        ...content.variables,
      });
      const text = interpolation.value.trim();
      const reason: ExclusionReason | null = row.is_navigation ? 'navigation'
        : !interpolation.complete ? 'unresolved_variables'
          : templateMarker.test(text) ? 'template_marker'
            : !text ? 'empty' : null;
      if (reason) {
        excluded.push({ responseId: row.id, scopePath: path(scope.id), reason, missingKeys: interpolation.missingKeys });
      } else {
        entries.push({ text: `${row.intent_name}: ${text}`, priority: row.order_priority });
      }
    }
    if (entries.length) faq.push([`## ${path(scope.id)}`, ...entries.sort((a, b) => a.priority - b.priority || compare(a.text, b.text)).map(entry => entry.text)].join('\n'));
  }
  const resourceFacts = data.contents.filter(content => developments.some(scope => scope.id === content.scope.id))
    .flatMap(content => content.resources.map(resource =>
    `Material disponible en ${path(content.scope.id)}: ${resource.title}.`
  )).sort(compare);
  const systemPrompt = [
    buildPersona(data.persona, data.brand.business_name),
    [
      '# Capacidades',
      'Puedes contestar con la información de esta guía. La conversación pasa con un asesor cuando la persona pide hablar con una persona, o cuando la guía no tiene la respuesta y la persona acepta la oferta de pasar con un asesor.',
      ...availableDevelopments.filter(item => item.hasAppointments).map(item => `Puedes iniciar el flujo de visita en ${item.name}.`),
      ...(availableDevelopments.some(item => item.hasAppointments) ? ['La visita se propone en el mensaje en que la nota del turno la marca como el siguiente paso.'] : []),
      ...availableDevelopments.filter(item => item.hasResources)
        .map(item => `Puedes enviar el brochure de ${item.name} (archivo: ${brochureFiles.get(item.id)!.join(', ')}); se envía cuando la persona lo pide.`),
      'Una acción está hecha cuando su herramienta lo confirma.',
      'Si hay varios desarrollos y la pregunta es ambigua, preguntas de cuál habla la persona.',
      'La guía reúne lo que se sabe; el resto lo resuelve un asesor y ofreces pasar la conversación con él.',
      ...resourceFacts,
    ].join('\n'),
    [
      '# Catálogo',
      'Los datos definidos en un alcance se aplican a sus descendientes; un dato propio sustituye al heredado con la misma clave.',
      ...catalogLines(new Set([ROOT_SCOPE_ID])),
      ...catalogBlocks.map(block => block.text),
    ].join('\n'),
    ['# Preguntas frecuentes', ...faq].join('\n'),
  ].join('\n\n');
  return {
    systemPrompt,
    contextSizeChars: systemPrompt.length,
    developmentNames: Array.from(new Set(developments.map(scope => scope.name))).sort(compare),
    developments: availableDevelopments,
    catalogBlocks,
    excluded: excluded.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))),
    moneyValues: collectCatalogMoneyAmounts(data.catalog),
    // Las respuestas interpoladas ya son contenido aprobado: repetir su cifra no es inventarla.
    faqMoneyValues: collectTextMoneyAmounts(faq),
  };
}

export async function buildAiContext() {
  return buildContextFromData(await loadAiContextData());
}
