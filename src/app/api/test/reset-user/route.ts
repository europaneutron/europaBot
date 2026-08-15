/**
 * Test Endpoint - Reset User
 * Resetea completamente el estado de un usuario para testing
 * Bloqueado en produccion por seguridad
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const { phoneNumber } = await request.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    const { supabaseServer } = await import('@/services/supabase/server-client');
    const { userRepository } = await import('@/data/repositories/user.repository');

    // Buscar usuario
    const user = await userRepository.findByPhone(phoneNumber);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    await userRepository.resetProgressForTesting(user.id);

    // Limpiar mensajes de conversación
    const { error: messagesError } = await supabaseServer
      .from('conversations')
      .delete()
      .eq('user_id', user.id);

    if (messagesError) {
      console.warn('Error deleting messages:', messagesError);
    }

    // Limpiar intent logs
    const { error: logsError } = await supabaseServer
      .from('intents_log')
      .delete()
      .eq('user_id', user.id);

    if (logsError) {
      console.warn('Error deleting intent logs:', logsError);
    }

    // Resetear fallback counter en user_session
    const { error: sessionError } = await supabaseServer
      .from('user_session')
      .update({
        fallback_count: 0,
        awaiting_advisor_name: false
      })
      .eq('user_id', user.id);

    if (sessionError) {
      console.warn('Error resetting user_session:', sessionError);
    }

    console.log(`✅ Usuario ${phoneNumber} (${user.id}) reseteado completamente:`);
    console.log('   - Checkpoints: reseteados');
    console.log('   - Appointment offer: reseteado');
    console.log('   - Mensajes: eliminados');
    console.log('   - Intent logs: eliminados');
    console.log('   - Session: reseteada');

    return NextResponse.json({
      success: true,
      message: 'Usuario reseteado completamente',
      userId: user.id
    });

  } catch (error) {
    console.error('❌ Error resetting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
