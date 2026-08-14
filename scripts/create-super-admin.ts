/**
 * Script para crear usuario super_admin inicial
 * Se debe ejecutar después de aplicar migración 008
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
// Prioriza el entorno local; .env.local queda como respaldo. dotenv no
// sobreescribe variables ya definidas, asi que el primero cargado gana.
config({ path: '.env.development.local' });
config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Variables de entorno no encontradas');
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

async function createSuperAdmin() {
  console.log('🔐 Creando usuario super_admin...\n');

  // 1. Crear usuario en auth.users
  const email = 'admin@europa.com';
  const password = 'europa2025'; // Cambiar en producción

  console.log(`📧 Email: ${email}`);
  console.log(`🔑 Password: ${password}\n`);

  // Verificar si ya existe en auth
  const { data: existingAuth, error: authCheckError } = await supabase.auth.admin.listUsers();
  
  const userExists = existingAuth?.users.find(u => u.email === email);

  let userId: string;

  if (userExists) {
    console.log('✅ Usuario ya existe en auth.users');
    userId = userExists.id;
  } else {
    console.log('Creando usuario en auth.users...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      console.error('❌ Error creando usuario en auth:', authError);
      return;
    }

    userId = authData.user.id;
    console.log('✅ Usuario creado en auth.users');
  }

  // 2. Insertar o actualizar en admin_users
  const { data: existingAdmin, error: checkError } = await supabase
    .from('admin_users')
    .select('*')
    .eq('id', userId)
    .single();

  if (existingAdmin) {
    console.log('✅ Usuario ya existe en admin_users');
    console.log(`   Rol actual: ${existingAdmin.role}`);
    console.log(`   Activo: ${existingAdmin.is_active}`);
  } else {
    console.log('Insertando en admin_users...');
    const { error: insertError } = await supabase
      .from('admin_users')
      .insert({
        id: userId,
        email,
        full_name: 'Super Administrador',
        role: 'super_admin',
        is_active: true
      });

    if (insertError) {
      console.error('❌ Error insertando en admin_users:', insertError);
      return;
    }

    console.log('✅ Usuario insertado en admin_users');
  }

  console.log('\n🎉 Super admin configurado exitosamente!');
  console.log('\n📋 Credenciales de acceso:');
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Rol: super_admin`);
  console.log('\n⚠️  IMPORTANTE: Cambiar el password en producción');
}

createSuperAdmin().catch(console.error);
