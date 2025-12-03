/**
 * Script temporal para probar la verificación de duplicados
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDuplicateCheck() {
  console.log('=== SIMULACION: Verificacion de duplicados ===\n');
  
  // 1. Buscar un usuario de prueba
  const { data: users } = await supabase
    .from('users')
    .select('id, phone_number, name')
    .limit(1);
  
  if (!users || users.length === 0) {
    console.log('No hay usuarios para probar');
    return;
  }
  
  const user = users[0];
  console.log('Usuario de prueba:', user.name || user.phone_number);
  console.log('ID:', user.id);
  
  // 2. Consultar con tabla INCORRECTA (conversation_messages)
  console.log('\n--- Prueba con tabla INCORRECTA (conversation_messages) ---');
  const { data: wrongTable, error: wrongError } = await supabase
    .from('conversation_messages')
    .select('message_text')
    .eq('user_id', user.id)
    .limit(1);
  
  console.log('Resultado:', wrongTable);
  console.log('Error:', wrongError ? wrongError.message : 'ninguno (silencioso pero null)');
  console.log('Es null?', wrongTable === null ? 'SI - Siempre entraria al if' : 'NO');
  
  // 3. Consultar con tabla CORRECTA (conversations)
  console.log('\n--- Prueba con tabla CORRECTA (conversations) ---');
  const { data: rightTable, error: rightError } = await supabase
    .from('conversations')
    .select('message_text')
    .eq('user_id', user.id)
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('Error:', rightError ? rightError.message : 'ninguno');
  console.log('Mensajes encontrados:', rightTable ? rightTable.length : 0);
  
  if (rightTable && rightTable.length > 0) {
    console.log('\nUltimos mensajes del bot:');
    rightTable.forEach((msg, i) => {
      const preview = msg.message_text ? msg.message_text.substring(0, 70) : '[vacio]';
      console.log('  ' + (i+1) + '. "' + preview + '..."');
    });
    
    // 4. Simular la verificacion de auto-offer
    const lastMessage = rightTable[0];
    const hasAutoOffer = lastMessage && lastMessage.message_text && 
                         lastMessage.message_text.includes('Veo que estas muy interesado');
    
    console.log('\n--- Simulacion de verificacion ---');
    console.log('Ultimo mensaje contiene auto-offer?', hasAutoOffer ? 'SI' : 'NO');
    console.log('Enviaria auto-offer de nuevo?', hasAutoOffer ? 'NO (ya enviado)' : 'SI (primera vez o no enviado)');
  }
  
  console.log('\n=== CONCLUSION ===');
  console.log('Tabla incorrecta: siempre null -> siempre duplicaria');
  console.log('Tabla correcta: obtiene mensaje real -> verifica correctamente');
  console.log('\n=== FIN SIMULACION ===');
}

testDuplicateCheck().catch(console.error);
