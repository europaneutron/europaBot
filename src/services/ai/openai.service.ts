import OpenAI from 'openai';
import { configRepository } from '@/data/repositories/config.repository';

export type AiModelRole = 'patterns' | 'extraction' | 'writing';

// El respaldo de los tres papeles es el único identificador verificado contra
// la API en este proyecto. El modelo es un parámetro de texto en la petición,
// pero no es texto libre: un nombre que no exista devuelve 404 al compilar, no
// al guardarlo. Elegir uno más capaz para la extracción es deseable y es la
// tarea 1.5, pero se hace comprobando el catálogo con `scripts/list-ai-models.ts`,
// no escribiendo un nombre de memoria.
const VERIFIED_FALLBACK_MODEL = 'gpt-4o-mini';

const MODEL_CONFIG: Record<AiModelRole, { key: string; fallback: string }> = {
  patterns: { key: 'ai_model', fallback: VERIFIED_FALLBACK_MODEL },
  extraction: { key: 'ai_extraction_model', fallback: VERIFIED_FALLBACK_MODEL },
  writing: { key: 'ai_writing_model', fallback: VERIFIED_FALLBACK_MODEL },
};

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
