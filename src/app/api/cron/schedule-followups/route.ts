/**
 * CRON JOB: Procesar Follow-ups (Sistema Doble Envío)
 * 
 * Ejecuta 2 veces al día (8am y 8pm México) para:
 * - Buscar conversaciones con último mensaje hace 6-18 horas
 * - Filtrar: sin cita, sin advisor_request, sin followup_sent
 * - Enviar mensaje inmediatamente
 * - Marcar como procesado permanentemente (followup_sent = true)
 * 
 * Protección: Requiere CRON_SECRET en header Authorization
 * Vercel Cron (hora México UTC-6):
 *   - "0 14 * * *" → 8am México (procesa ayer 2pm - hoy 2am)
 *   - "0 2 * * *"  → 8pm México (procesa hoy 2am - hoy 2pm)
 * 
 * Ventana de búsqueda: 6-18 horas atrás (cobertura completa 24h)
 */

import { NextRequest, NextResponse } from 'next/server';
import { followupProcessor } from '@/core/followup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // 1. Validar CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[CRON] CRON_SECRET no configurado en variables de entorno');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[CRON] Intento de acceso no autorizado a process-followups');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Ejecutar procesamiento de follow-ups
    console.log('[CRON] Iniciando procesamiento de follow-ups diario...');
    const result = await followupProcessor.processAbandonedConversations();

    console.log(
      `[CRON] ✅ Procesadas: ${result.processed} | ` +
      `Enviadas: ${result.sent} | ` +
      `Omitidas: ${result.skipped} | ` +
      `Errores: ${result.errors}`
    );

    // 3. Retornar resultado
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CRON] Error en process-followups:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
