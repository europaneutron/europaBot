/**
 * API Route para generar patrones de intencion usando OpenAI
 * Recibe nombre + descripcion, genera keywords, synonyms, typos y phrases
 * Solo accesible por admins autenticados
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
import { configRepository } from '@/data/repositories/config.repository';
import { getAiModel, getOpenAIClient } from '@/services/ai/openai.service';

export async function POST(request: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const { display_name, description } = body;

    if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
      return NextResponse.json(
        { error: 'El nombre de la intencion es requerido' },
        { status: 400 }
      );
    }

    const [openai, model, businessContext] = await Promise.all([
      getOpenAIClient(),
      getAiModel('patterns'),
      configRepository.get('ai_business_context', ''),
    ]);

    // Construir prompt
    const systemPrompt = buildSystemPrompt(businessContext);
    const userPrompt = buildUserPrompt(display_name.trim(), description?.trim());

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: 'No se obtuvo respuesta del modelo' },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(content);

    // Validar estructura de respuesta
    const result = {
      keywords: validateStringArray(parsed.keywords),
      synonyms: validateStringArray(parsed.synonyms),
      typos: validateStringArray(parsed.typos),
      phrases: validateStringArray(parsed.phrases),
    };

    if (result.keywords.length < 3) {
      return NextResponse.json(
        { error: 'El modelo no genero suficientes keywords. Intenta con una descripcion mas detallada.' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Generate-Patterns] Error:', error);

    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return NextResponse.json(
          { error: 'API key de OpenAI invalida o expirada. Actualiza la clave en Configuracion.' },
          { status: 400 }
        );
      }
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Limite de uso de OpenAI alcanzado. Intenta mas tarde.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: `Error de OpenAI: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

function buildSystemPrompt(businessContext: string): string {
  const contextBlock = businessContext
    ? `\nContexto del negocio: ${businessContext}\nUsa este contexto para generar patrones mas relevantes y especificos al dominio del negocio.`
    : '';

  return `Eres un asistente especializado en generar patrones de reconocimiento de intenciones para un chatbot de WhatsApp en espanol.${contextBlock}

Tu tarea es generar arrays de palabras y frases que ayuden a detectar cuando un usuario pregunta sobre un tema especifico.

REGLAS:
- Genera en espanol latinoamericano
- Las keywords son palabras clave individuales (1-2 palabras maximo)
- Los synonyms son variaciones, sinonimos y formas alternativas de las keywords
- Los typos son errores de escritura comunes que la gente comete en WhatsApp (sin tildes, letras cambiadas, abreviaciones)
- Las phrases son oraciones completas o fragmentos que un usuario escribiria naturalmente en WhatsApp
- No incluyas emojis
- No repitas elementos entre categorias
- Genera entre 8-15 keywords, 5-10 synonyms, 5-10 typos, y 5-10 phrases

Responde SOLO con un JSON valido con esta estructura exacta:
{
  "keywords": ["palabra1", "palabra2"],
  "synonyms": ["sinonimo1", "sinonimo2"],
  "typos": ["typo1", "typo2"],
  "phrases": ["frase completa 1", "frase completa 2"]
}`;
}

function buildUserPrompt(displayName: string, description?: string): string {
  if (description) {
    return `Genera patrones de reconocimiento para la intencion "${displayName}".
Descripcion: ${description}`;
  }
  return `Genera patrones de reconocimiento para la intencion "${displayName}".`;
}

function validateStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim().toLowerCase());
}
