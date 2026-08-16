/**
 * CRON JOB: Avanzar compilaciones pendientes
 *
 * La compilacion va por etapas porque un brochure no cabe en el tiempo de una
 * peticion. Que avance no puede depender de que el cliente deje una pestana
 * abierta: el navegador empuja mientras esta mirando, y esto se encarga del
 * resto -de quien cerro la pestana, de quien se fue a comer, y del que subio
 * el material desde el telefono-.
 *
 * Solo mueve ejecuciones que estan corriendo. Las que esperan una decision
 * humana se quedan donde estan, que es justo lo que deben hacer.
 *
 * Proteccion: requiere CRON_SECRET en el header Authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { documentCompilerService } from '@/core/document-compiler/document-compiler.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_RUNS_PER_TICK = 5;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const pending = await documentCompilerRepository.listAdvanceableRuns(MAX_RUNS_PER_TICK);
  const results: Array<{ runId: string; stage: string | null; error?: string }> = [];

  for (const run of pending) {
    try {
      const advanced = await documentCompilerService.runNextStage(run.id);
      results.push({ runId: run.id, stage: advanced?.current_stage ?? null });
    } catch (error) {
      // Una compilacion que falla ya queda marcada como fallida por el servicio.
      // No puede impedir que las demas avancen.
      results.push({
        runId: run.id,
        stage: null,
        error: error instanceof Error ? error.message : 'error desconocido',
      });
    }
  }

  return NextResponse.json({ advanced: results.length, results });
}
