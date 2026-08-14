import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
// Prioriza el entorno local; .env.local queda como respaldo. dotenv no
// sobreescribe variables ya definidas, asi que el primero cargado gana.
config({ path: path.resolve(process.cwd(), '.env.development.local') });
config({ path: path.resolve(process.cwd(), '.env.local') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Faltan variables de entorno');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅' : '❌');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createAdmin() {
  console.log('🔧 Creando usuario admin...\n');

  const email = 'admin@europa.com';
  const password = 'europa2025';

  try {
    // 1. Crear usuario en auth.users
    console.log('📝 Paso 1: Creando usuario en Supabase Auth...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'super_admin'
      }
    });

    if (authError) {
      console.error('❌ Error creando usuario en Auth:', authError.message);
      return;
    }

    console.log('✅ Usuario creado en Auth:', authData.user.id);

    // 2. Crear registro en admin_users
    console.log('\n📝 Paso 2: Creando perfil de admin...');
    const { data: adminData, error: adminError } = await supabase
      .from('admin_users')
      .insert({
        id: authData.user.id,
        email,
        full_name: 'Super Admin',
        role: 'super_admin',
        is_active: true
      })
      .select()
      .single();

    if (adminError) {
      console.error('❌ Error creando perfil admin:', adminError.message);
      return;
    }

    console.log('✅ Perfil admin creado:', adminData);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Usuario admin creado exitosamente!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🔑 Credenciales de acceso:');
    console.log(`   URL: http://localhost:3000/login`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}\n`);

  } catch (error) {
    console.error('❌ Error inesperado:', error);
  }
}

createAdmin();
