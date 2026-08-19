/**
 * Que entiende el bot, dicho por el bot.
 *
 * Se pegan las formas reales en que un lead pregunta y se corre el matcher de
 * verdad --el mismo que atiende el webhook-- contra cada una. Sin esto, saber
 * si el vocabulario aguanta era adivinar: la unica forma de enterarse de que
 * "ubicados" no engancha con "ubicacion" era que un lead lo escribiera.
 *
 * No responde nada ni toca la conversacion: solo detecta.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { intentDetectionService } from '@/core/intent-engine/intent-detection.service';
import { supabaseServer } from '@/services/supabase/server-client';
import { ROOT_SCOPE_ID } from '@/data/repositories/scope.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

const MAX_PHRASES = 100;

const bodySchema = z.object({
  phrases: z.array(z.string()).min(1, 'Escribe al menos una frase'),
  scopeId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const input = bodySchema.parse(await request.json());
    const scopeId = input.scopeId || ROOT_SCOPE_ID;
    const phrases = input.phrases
      .map(phrase => phrase.trim())
      .filter(Boolean)
      .slice(0, MAX_PHRASES);

    const results = [];
    for (const phrase of phrases) {
      const detection = await intentDetectionService.detect(phrase, supabaseServer, scopeId);
      const match = detection.intent;
      results.push({
        phrase,
        detected: Boolean(match),
        intentName: match?.intent_name ?? null,
        confidence: match ? Number(match.confidence.toFixed(2)) : null,
        method: match?.detection_method ?? null,
        scopeId: match?.scope_id ?? null,
        // La segunda mejor, para el caso incomodo: enganchó, pero con la
        // pregunta equivocada y por poco margen.
        runnerUp: detection.all_matches[1]
          ? {
              intentName: detection.all_matches[1].intent_name,
              confidence: Number(detection.all_matches[1].confidence.toFixed(2)),
            }
          : null,
      });
    }

    return NextResponse.json({
      scopeId,
      total: results.length,
      missed: results.filter(result => !result.detected).length,
      results,
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || 'Las frases no son válidas'
      : error instanceof Error
        ? error.message
        : 'No fue posible probar las frases';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
