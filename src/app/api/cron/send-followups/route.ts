/**
 * CRON JOB: Enviar Follow-ups Programados
 * 
 * Ejecuta cada hora de 9am-6pm para:
 * - Enviar todos los mensajes programados pendientes
 * - Validar ventana horaria (9am-6pm)
 * - Registrar en conversations
 * - Marcar como enviados
 * 
 * Protección: Requiere CRON_SECRET en header Authorization
 * Vercel Cron: "0 9-18 * * *" (cada hora, 10 ejecuciones/día)
 * 
 * Nota: Cada ejecución procesa TODOS los mensajes pendientes
 * hasta ese momento, sin límite de cantidad.
 */

import { NextRequest, NextResponse } from 'next/server';
import { followupSender } from '@/core/followup';

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
      console.warn('[CRON] Intento de acceso no autorizado a send-followups');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Ejecutar envío de follow-ups
    console.log('[CRON] Iniciando envío de follow-ups programados...');
    const result = await followupSender.sendPendingMessages();

    console.log(`[CRON] ✅ Enviados: ${result.sent}, Omitidos: ${result.skipped}, Errores: ${result.errors}`);

    // 3. Retornar resultado
    return NextResponse.json({
      success: true,
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
      timestamp: new Date().toISOString(),
      details: result.details
    });

  } catch (error) {
    console.error('[CRON] Error en send-followups:', error);
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
