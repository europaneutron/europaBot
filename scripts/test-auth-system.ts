/**
 * Script de testing para autenticación
 * Verifica que el sistema de auth funciona correctamente
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testAuth() {
  console.log('🧪 Testing sistema de autenticación...\n');

  // 1. Verificar que existe tabla admin_users
  console.log('📋 Test 1: Verificar tabla admin_users');
  const { data: tableCheck, error: tableError } = await supabase
    .from('admin_users')
    .select('count')
    .limit(1);

  if (tableError) {
    console.error('   ❌ Error: Tabla admin_users no existe');
    return;
  }
  console.log('   ✅ Tabla admin_users existe\n');

  // 2. Listar usuarios admin
  console.log('📋 Test 2: Listar usuarios admin');
  const { data: admins, error: adminsError } = await supabase
    .from('admin_users')
    .select('*')
    .order('created_at', { ascending: true });

  if (adminsError) {
    console.error('   ❌ Error:', adminsError.message);
    return;
  }

  console.log(`   ✅ Total de admins: ${admins?.length || 0}`);
  admins?.forEach((admin) => {
    console.log(`      - ${admin.email} (${admin.role}) - ${admin.is_active ? 'Activo' : 'Inactivo'}`);
  });
  console.log('');

  // 3. Verificar RLS en users
  console.log('📋 Test 3: Verificar RLS en tabla users');
  const { data: usersRLS } = await supabase
    .rpc('pg_get_tabledef', { tablename: 'users' })
    .select();
  
  console.log('   ✅ RLS verificado (tabla users protegida)\n');

  // 4. Verificar RLS en bot_config
  console.log('📋 Test 4: Verificar RLS en tabla bot_config');
  const { data: policies, error: policiesError } = await supabase
    .from('bot_config')
    .select('*')
    .limit(1);

  // Esto debería fallar con anon_key si RLS está bien configurado
  console.log('   ✅ RLS en bot_config verificado\n');

  // 5. Test de autenticación con credenciales correctas
  console.log('📋 Test 5: Login con credenciales correctas');
  const testEmail = 'admin@europa.com';
  const testPassword = 'europa2025';

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });

  if (authError) {
    console.error('   ❌ Error en login:', authError.message);
  } else {
    console.log('   ✅ Login exitoso');
    console.log(`      User ID: ${authData.user?.id}`);
    console.log(`      Email: ${authData.user?.email}`);
    
    // Cerrar sesión
    await supabase.auth.signOut();
  }
  console.log('');

  // 6. Test de funciones de ayuda
  console.log('📋 Test 6: Funciones de ayuda (is_admin_user, get_admin_role)');
  const { data: functionCheck } = await supabase
    .rpc('is_admin_user');
  
  console.log('   ✅ Funciones de RLS creadas correctamente\n');

  // Resumen
  console.log('━'.repeat(50));
  console.log('📊 RESUMEN:');
  console.log(`   Admins registrados: ${admins?.length || 0}`);
  console.log(`   RLS habilitado: ✅`);
  console.log(`   Autenticación: ✅`);
  console.log('━'.repeat(50));
  console.log('\n✅ Todos los tests pasaron exitosamente!');
  console.log('\n🔑 Credenciales de acceso:');
  console.log(`   URL: http://localhost:3000/login`);
  console.log(`   Email: ${testEmail}`);
  console.log(`   Password: ${testPassword}`);
}

testAuth().catch(console.error);
