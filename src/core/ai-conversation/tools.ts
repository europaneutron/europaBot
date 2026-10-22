import type Anthropic from '@anthropic-ai/sdk';
import type { ProcessedResponse } from '@/core/conversation/message-processor';
import type { BotResponse } from '@/types/message-fragments.types';
import { attachmentNames } from './brochure';

export interface AiDevelopment {
  id: string;
  name: string;
  hasResources: boolean;
  hasAppointments: boolean;
}
export type AiToolName = 'agendar_visita' | 'hablar_con_asesor' | 'enviar_brochure';
const descriptions: Record<AiToolName, string> = {
  agendar_visita: 'Inicia el flujo de visita; el flujo pide los datos y confirma la cita. Con varios desarrollos, aclara cuál antes de llamar.',
  hablar_con_asesor: 'Inicia la derivación a un asesor humano. Se usa cuando la persona pide hablar con una persona, o cuando la guía no tiene la respuesta y la persona aceptó la oferta de pasar con un asesor. Una inconformidad o una duda sobre algo ya dicho en la conversación se aclara en la conversación. El desarrollo es opcional.',
  enviar_brochure: 'Envía el brochure del desarrollo (PDF u otros recursos) junto con el mensaje de este turno, que escribes en la misma respuesta que la llamada.',
};
export function availableDevelopments(name: AiToolName, developments: AiDevelopment[]) {
  return developments.filter(item => name === 'enviar_brochure' ? item.hasResources
    : name === 'agendar_visita' ? item.hasAppointments : true);
}

export function buildTools(developments: AiDevelopment[]): Anthropic.Tool[] {
  return (Object.keys(descriptions) as AiToolName[]).flatMap(name => {
    const available = availableDevelopments(name, developments);
    if (!available.length && name !== 'hablar_con_asesor') return [];
    const parameter = developments.length !== 1 && available.length > 0;
    return [{
      name, description: descriptions[name], strict: true,
      input_schema: {
        type: 'object',
        properties: parameter ? { desarrollo: { type: 'string', enum: available.map(item => item.name).sort() } } : {},
        required: parameter && name !== 'hablar_con_asesor' ? ['desarrollo'] : [],
        additionalProperties: false,
      },
    }];
  });
}

export interface ToolResult {
  fact: string;
  isError?: boolean;
  responses?: BotResponse[];
  terminal?: ProcessedResponse;
}
export interface ToolActions {
  loadDevelopments(): Promise<AiDevelopment[]>;
  appointment(scopeId: string): Promise<ProcessedResponse>;
  /** La cita vigente del lead en palabras, o null. Opcional para los dobles de prueba que no la necesitan. */
  activeAppointment?(): Promise<string | null>;
  advisor(scopeId?: string): Promise<ProcessedResponse>;
  brochure(scopeId: string): Promise<BotResponse[]>;
}

/** Se comprueba el esquema anunciado y después el contenido vigente, antes de cualquier efecto. */
export async function executeAiTool(
  call: Pick<Anthropic.ToolUseBlock, 'name' | 'input'>,
  declared: AiDevelopment[], actions: ToolActions
): Promise<ToolResult> {
  const tool = buildTools(declared).find(item => item.name === call.name);
  if (!tool) return { fact: 'Herramienta no disponible.', isError: true };
  if (!call.input || typeof call.input !== 'object' || Array.isArray(call.input)) {
    return { fact: 'Parámetros inválidos.', isError: true };
  }
  const input = call.input as Record<string, unknown>;
  const hasParameter = Object.hasOwn(tool.input_schema.properties || {}, 'desarrollo');
  if (Object.keys(input).some(key => key !== 'desarrollo' || !hasParameter)
    || (input.desarrollo !== undefined && typeof input.desarrollo !== 'string')) {
    return { fact: 'Parámetros inválidos.', isError: true };
  }
  const name = call.name as AiToolName;
  const selected = declared.length === 1 ? declared[0].name : input.desarrollo;
  if (selected === undefined && name !== 'hablar_con_asesor') {
    return { fact: 'Falta aclarar el desarrollo.', isError: true };
  }
  const originallyAvailable = availableDevelopments(name, declared);
  if (selected !== undefined && !originallyAvailable.some(item => item.name === selected)) {
    return { fact: 'Desarrollo no disponible para esta herramienta.', isError: true };
  }
  const current = availableDevelopments(name, await actions.loadDevelopments());
  const matches = current.filter(item => item.name === selected);
  if (selected !== undefined && matches.length !== 1) {
    return { fact: 'El desarrollo dejó de estar disponible o su nombre es ambiguo.', isError: true };
  }
  const scopeId = matches[0]?.id;
  if (name === 'agendar_visita') {
    // Un segundo flujo con una cita vigente dejaba al lead con dos citas: la nueva
    // no reemplaza a la anterior. Cambiarla es trabajo del asesor.
    const existing = await actions.activeAppointment?.();
    if (existing) {
      return { fact: `La persona ya tiene una visita agendada: ${existing}. Para cambiarla, la pasas con un asesor.` };
    }
    return { fact: 'El flujo de visita se inició; todavía no hay cita confirmada.', terminal: await actions.appointment(scopeId!) };
  }
  if (name === 'hablar_con_asesor') {
    return { fact: 'El flujo de derivación tomó el turno.', terminal: await actions.advisor(scopeId) };
  }
  const responses = await actions.brochure(scopeId!);
  const files = attachmentNames(responses);
  return responses.length ? { fact: `El brochure${files.length ? ` (archivo: ${files.join(', ')})` : ''} se envía junto con tu mensaje.`, responses }
    : { fact: 'Este desarrollo no tiene brochure disponible.', isError: true };
}
