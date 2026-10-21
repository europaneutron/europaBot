import type Anthropic from '@anthropic-ai/sdk';
import type { ProcessedResponse } from '@/core/conversation/message-processor';
import type { BotResponse } from '@/types/message-fragments.types';
import type { NewAiModelCall } from '@/data/repositories/ai-model-call.repository';
import { classifyAnthropicError, type ResponderClient, type ResponderConfig } from '@/services/anthropic/client';
import type { buildContextFromData } from './context-builder';
import { buildTools, executeAiTool, type ToolActions } from './tools';
import { checkMoneyAmounts } from './guards/money-guard';
import { formatForWhatsApp } from './guards/whatsapp-format';

export type AiContext = ReturnType<typeof buildContextFromData>;
export type AiResponseResult =
  | { kind: 'response'; response: ProcessedResponse }
  | { kind: 'fallback'; reason: string; errorType?: string; afterSend?: Promise<void> };

export interface ResponderInput {
  userId: string;
  messageId: string;
  config: ResponderConfig;
  context: AiContext;
  messages: Anthropic.MessageParam[];
}
export interface ResponderDependencies {
  client: ResponderClient;
  tools: ToolActions;
  log(call: NewAiModelCall): Promise<void>;
  now?: () => number;
}

export function emptyCall(input: Pick<ResponderInput, 'userId' | 'messageId' | 'config'> & { context: Pick<AiContext, 'contextSizeChars'> }): NewAiModelCall {
  return {
    user_id: input.userId, conversation_id: null, message_id: input.messageId,
    call_type: 'responder', model: input.config.model,
    input_tokens: null, cache_read_input_tokens: null, cache_creation_input_tokens: null,
    output_tokens: null, latency_ms: 0, tools_called: [], guards_applied: [],
    fallback_reason: null, error_type: null, context_size_chars: input.context.contextSizeChars,
  };
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content.filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text).join('\n').trim();
}

/** Mismas guardas que la respuesta final; null deja que el loop pida el texto en otra llamada. */
function acceptText(text: string, log: NewAiModelCall, moneyValues: number[]): string | null {
  const formatted = formatForWhatsApp(text);
  if (formatted.fixes.length) log.guards_applied.push({ guard: 'whatsapp_format', fixes: formatted.fixes });
  if (!formatted.text.trim()) return null;
  const money = checkMoneyAmounts(formatted.text, moneyValues);
  if (!money.valid) {
    log.guards_applied.push({ guard: 'money', invalid: money.invalid });
    return null;
  }
  return formatted.text;
}

export async function respondWithAi(input: ResponderInput, deps: ResponderDependencies): Promise<AiResponseResult> {
  const now = deps.now || Date.now;
  const deadline = now() + input.config.timeoutMs;
  const messages = [...input.messages];
  const tools = buildTools(input.context.developments);
  const attachments: BotResponse[] = [];
  const executed = new Map<string, Awaited<ReturnType<typeof executeAiTool>>>();
  let toolRounds = 0;
  let moneyRetried = false;
  while (true) {
    const started = now();
    const log = emptyCall(input);
    const fallback = (reason: string, errorType?: string): AiResponseResult => {
      log.fallback_reason = reason;
      log.error_type = errorType || null;
      return { kind: 'fallback', reason, errorType };
    };
    try {
      const remaining = deadline - now();
      if (remaining <= 0) return fallback('timeout');
      const message = await deps.client.create({
        model: input.config.model, max_tokens: 2000, stream: false,
        output_config: { effort: input.config.effort },
        system: [{ type: 'text', text: input.context.systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages, tools,
        tool_choice: toolRounds >= 2 || moneyRetried ? { type: 'none' }
          : { type: 'auto', disable_parallel_tool_use: true },
      }, remaining);
      log.latency_ms = Math.max(0, now() - started);
      log.input_tokens = message.usage.input_tokens;
      log.output_tokens = message.usage.output_tokens;
      log.cache_read_input_tokens = message.usage.cache_read_input_tokens ?? 0;
      log.cache_creation_input_tokens = message.usage.cache_creation_input_tokens ?? 0;
      // Un bloque parcial o rechazado no autoriza ni texto ni efectos secundarios.
      if (message.stop_reason === 'refusal') return fallback('refusal');
      if (message.stop_reason === 'max_tokens') return fallback('max_tokens');
      if (now() > deadline) return fallback('timeout');
      if (message.stop_reason === 'tool_use') {
        if (toolRounds >= 2 || moneyRetried) return fallback('tool_round_limit');
        const calls = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
        if (!calls.length) return fallback('invalid_tool_response');
        log.tools_called = calls.map(call => ({ name: call.name, input: call.input }));
        // El proveedor recibe disable_parallel_tool_use. Rechazar una violación evita
        // iniciar dos flujos terminales antes de poder devolver su mensaje original.
        if (calls.length > 1) return fallback('parallel_tool_calls');
        toolRounds++;
        messages.push({ role: 'assistant', content: message.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const call of calls) {
          const key = JSON.stringify([call.name, call.input]);
          let result = executed.get(key);
          try {
            if (!result) {
              result = await executeAiTool(call, input.context.developments, deps.tools);
              executed.set(key, result);
              if (result.responses) attachments.push(...result.responses);
            }
          } catch (error) {
            console.error('Falló una herramienta del contestador:', error);
            result = { fact: 'La herramienta falló; la acción no está confirmada.', isError: true };
            log.error_type = error instanceof Error ? error.name : 'UnknownError';
          }
          results.push({ type: 'tool_result', tool_use_id: call.id, content: result.fact, is_error: result.isError });
          log.guards_applied.push({ tool: call.name, result: result.fact, rejected: !!result.isError });
          if (result.terminal) {
            // Los flujos son terminales por D8: no se gasta otra llamada para reescribirlos.
            messages.push({ role: 'user', content: results });
            const responses = [...attachments, ...result.terminal.responses];
            return { kind: 'response', response: { ...result.terminal, responses, shouldSend: responses.length > 0 } };
          }
        }
        messages.push({ role: 'user', content: results });
        // Si el modelo ya escribió su mensaje junto con la llamada y el brochure se confirmó,
        // ese texto es la respuesta: se evita una segunda llamada.
        const sameTurnText = textOf(message.content);
        if (sameTurnText && attachments.length && results.every(item => !item.is_error)) {
          const accepted = acceptText(sameTurnText, log, input.context.moneyValues);
          if (accepted) return { kind: 'response', response: { responses: [accepted, ...attachments], shouldSend: true, wasDetected: true, isFallback: false, flowHandled: true } };
        }
        continue;
      }
      if (message.stop_reason !== 'end_turn') return fallback('unexpected_stop_reason');
      if (message.content.some(block => block.type === 'tool_use')) return fallback('invalid_tool_response');
      const text = textOf(message.content);
      if (!text) return fallback('empty_response');
      const formatted = formatForWhatsApp(text);
      if (formatted.fixes.length) log.guards_applied.push({ guard: 'whatsapp_format', fixes: formatted.fixes });
      if (!formatted.text.trim()) return fallback('empty_response');
      const money = checkMoneyAmounts(formatted.text, input.context.moneyValues);
      if (!money.valid) {
        log.guards_applied.push({ guard: 'money', invalid: money.invalid });
        if (moneyRetried) return fallback('invalid_money');
        moneyRetried = true;
        messages.push({ role: 'assistant', content: message.content });
        messages.push({ role: 'user', content: 'La validación de salida detectó cifras ausentes del catálogo. Redacta de nuevo usando solo las cifras documentadas.' });
        continue;
      }
      return {
        kind: 'response',
        response: { responses: [formatted.text, ...attachments], shouldSend: true, wasDetected: true, isFallback: false, flowHandled: true },
      };
    } catch (error) {
      const failure = classifyAnthropicError(error);
      return fallback(failure.reason, failure.errorType);
    } finally {
      if (!log.latency_ms) log.latency_ms = Math.max(0, now() - started);
      // El fallo de auditoría queda visible, pero no repite un flujo que ya tuvo efectos.
      try { await deps.log(log); }
      catch (error) { console.error('No se pudo registrar la llamada del contestador:', error); }
    }
  }
}
