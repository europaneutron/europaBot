/**
 * API de Testing - Procesa mensajes sin WhatsApp real
 */

import { NextRequest, NextResponse } from 'next/server';
import { messageProcessor } from '@/core/conversation/message-processor';

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, message, messageId } = await request.json();

    if (!phoneNumber || !message) {
      return NextResponse.json(
        { error: 'phoneNumber and message are required' },
        { status: 400 }
      );
    }

    console.log(`\n📨 [TEST] Procesando mensaje de ${phoneNumber}: "${message}"`);

    // Procesar con el Message Processor real
    const result = await messageProcessor.processMessage(
      phoneNumber,
      message,
      messageId || `test_${Date.now()}`,
      'Usuario Test'
    );

    // Convertir responses a texto para logging
    const responseText = result.responses
      .map(r => typeof r === 'string' ? r : `[Fragmentado: ${r.fragments.length} partes]`)
      .join('\n---\n');

    console.log(`📤 [TEST] Respuesta: "${responseText.substring(0, 100)}..."`);
    console.log(`🎯 [TEST] Intent detectado: ${result.wasDetected ? 'SÍ' : 'NO'}`);
    console.log(`⚠️ [TEST] Es fallback: ${result.isFallback ? 'SÍ' : 'NO'}\n`);

    return NextResponse.json({
      success: true,
      responses: result.responses, // Ahora devuelve array de BotResponse
      wasDetected: result.wasDetected,
      isFallback: result.isFallback,
      intent: result.wasDetected ? 'detected' : null,
      confidence: result.wasDetected ? 0.95 : 0
    });

  } catch (error) {
    console.error('❌ [TEST] Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Error processing message',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
