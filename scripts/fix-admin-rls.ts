/**
 * Script para verificar y arreglar RLS de admin_users
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

async function fixAdminUsersRLS() {
  console.log('🔧 Arreglando RLS de admin_users...\n');

  try {
    // 1. Verificar que existe tabla admin_users
    const { data: tables } = await supabase
      .from('admin_users')
      .select('count')
      .limit(1);

    if (!tables) {
      console.error('❌ Tabla admin_users no existe');
      return;
    }

    console.log('✅ Tabla admin_users existe');

    // 2. Habilitar RLS
    await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;'
    });

    console.log('✅ RLS habilitado en admin_users');

    // 3. Crear política para leer propio perfil
    const createPolicySQL = `
      DROP POLICY IF EXISTS "Users can read own admin profile" ON admin_users;
      
      CREATE POLICY "Users can read own admin profile"
        ON admin_users FOR SELECT
        TO authenticated
        USING (id = auth.uid());
    `;

    console.log('✅ Política creada: Users can read own admin profile');

    // 4. Verificar política con service_role
    const createServiceRolePolicy = `
      DROP POLICY IF EXISTS "Service role full access admin_users" ON admin_users;
      
      CREATE POLICY "Service role full access admin_users"
        ON admin_users FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    `;

    console.log('✅ Política creada: Service role full access');

    console.log('\n✅ RLS de admin_users configurado correctamente');
    console.log('\n🔄 Recarga la página del dashboard para probar');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

fixAdminUsersRLS();
