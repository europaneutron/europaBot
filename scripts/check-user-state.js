require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const phone = process.argv[2] || '5219933906926';
  
  const { data: user } = await supabase
    .from('users')
    .select('id, phone_number, name')
    .eq('phone_number', phone)
    .single();
  
  if (!user) {
    console.log('Usuario no encontrado');
    return;
  }
  
  console.log('Usuario:', user);
  
  const { data: progress } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', user.id)
    .single();
  
  console.log('Flow State:', progress?.appointment_flow_state);
  console.log('Flow Data:', progress?.appointment_flow_data);
  
  const { data: lastMsgs } = await supabase
    .from('conversations')
    .select('message_text, direction, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(6);
  
  console.log('\nUltimos mensajes:');
  lastMsgs?.reverse().forEach(m => {
    const dir = m.direction === 'inbound' ? 'USER' : 'BOT';
    console.log(`[${dir}] ${m.message_text.substring(0, 80)}...`);
  });
}

check();
