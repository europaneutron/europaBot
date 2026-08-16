import OpenAI from 'openai';
import { configRepository } from '@/data/repositories/config.repository';

export type AiModelRole = 'patterns' | 'extraction' | 'writing';

// El modelo es un parámetro de texto en la petición, pero no es texto libre:
// un nombre que no exista devuelve 404 al compilar, no al guardarlo. Estos
// respaldos están comprobados contra el catálogo real de la cuenta con
// `scripts/list-ai-models.ts`; cambiarlos exige volver a comprobarlos.
const MODEL_CONFIG: Record<AiModelRole, { key: string; fallback: string }> = {
  patterns: { key: 'ai_model', fallback: 'gpt-4o-mini' },
  extraction: { key: 'ai_extraction_model', fallback: 'gpt-5.4' },
  writing: { key: 'ai_writing_model', fallback: 'gpt-5.4-mini' },
};

/**
 * Comprueba que un identificador exista en el catálogo de la cuenta.
 *
 * Se usa al guardar desde el dashboard: sin esto, un nombre mal escrito se
 * guarda sin protestar y falla mucho después, dentro de una compilación, con
 * el 404 enterrado en `last_error`.
 */
export async function listAvailableModels(): Promise<string[]> {
  const openai = await getOpenAIClient();
  const models = await openai.models.list();
  return models.data.map(model => model.id);
}

export async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await configRepository.getVaultSecret('openai_api_key');
  if (!apiKey) {
    throw new Error(
      'API key de OpenAI no configurada. Configura la clave en Configuración > Inteligencia Artificial.'
    );
  }

  return new OpenAI({ apiKey });
}

export async function getAiModel(role: AiModelRole): Promise<string> {
  const config = MODEL_CONFIG[role];
  return configRepository.get(config.key, config.fallback);
}
