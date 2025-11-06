import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function debugAuth() {
  console.log('🔍 Debug: Autenticación y RLS\n');

  // Cliente con service role (sin RLS)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Cliente normal (con RLS)
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // 1. Login
    console.log('📝 Paso 1: Login con credenciales...');
    const { data: authData, error: loginError } = await supabaseClient.auth.signInWithPassword({
      email: 'admin@europa.com',
      password: 'europa2025'
    });

    if (loginError) {
      console.error('❌ Error en login:', loginError.message);
      return;
    }

    console.log('✅ Login exitoso');
    console.log('   User ID:', authData.user.id);
    console.log('   Email:', authData.user.email);

    // 2. Verificar RLS en admin_users
    console.log('\n📝 Paso 2: Verificar políticas RLS...');
    
    // Con service role (sin RLS)
    const { data: adminWithService, error: serviceError } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    console.log('\n   Con SERVICE ROLE (sin RLS):');
    if (serviceError) {
      console.error('   ❌ Error:', serviceError.message);
    } else {
      console.log('   ✅ Usuario encontrado:', adminWithService.email, '-', adminWithService.role);
    }

    // Con cliente autenticado (con RLS)
    const { data: adminWithRLS, error: rlsError } = await supabaseClient
      .from('admin_users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    console.log('\n   Con CLIENTE AUTENTICADO (con RLS):');
    if (rlsError) {
      console.error('   ❌ Error:', rlsError.message);
      console.error('   ❌ Code:', rlsError.code);
      console.error('   ❌ Details:', rlsError.details);
    } else {
      console.log('   ✅ Usuario encontrado:', adminWithRLS.email, '-', adminWithRLS.role);
    }

    // 3. Verificar tabla bot_config
    console.log('\n📝 Paso 3: Verificar acceso a bot_config...');
    const { data: configs, error: configError } = await supabaseClient
      .from('bot_config')
      .select('config_key, config_value')
      .limit(3);

    if (configError) {
      console.error('   ❌ Error:', configError.message);
    } else {
      console.log('   ✅ Configs encontradas:', configs.length);
    }

    // 4. Verificar sesión actual
    console.log('\n📝 Paso 4: Verificar sesión actual...');
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
      console.log('   ✅ Sesión activa');
      console.log('   User ID:', session.user.id);
      console.log('   Expires at:', new Date(session.expires_at! * 1000).toLocaleString());
    } else {
      console.error('   ❌ No hay sesión activa');
    }

    // Logout
    await supabaseClient.auth.signOut();
    console.log('\n✅ Debug completado');

  } catch (error) {
    console.error('❌ Error inesperado:', error);
  }
}

debugAuth();
