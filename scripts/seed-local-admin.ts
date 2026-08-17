/**
 * Siembra el admin del entorno local.
 *
 * Existe porque cada `db reset` borra `auth.users` y `admin_users`, y el
 * usuario con el que se entra al panel se venia creando a mano. Es idempotente:
 * si ya existe, actualiza la contrasena y el perfil en vez de fallar.
 *
 * Solo local: se niega a correr contra una URL que no sea 127.0.0.1/localhost.
 *
 *   npx tsx scripts/seed-local-admin.ts
 */
import { config } from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: path.resolve(process.cwd(), '.env.development.local') });
config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL = process.env.LOCAL_ADMIN_EMAIL || 'leo@local.test';
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'local123456';
const FULL_NAME = 'Leonardo (local)';

async function main() {
  if (!supabaseUrl || !serviceKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const host = new URL(supabaseUrl).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.error(`Este script es solo para local. URL apuntando a: ${host}`);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) {
    console.error('Error listando usuarios:', listError.message);
    process.exit(1);
  }

  const existing = list.users.find(user => user.email === EMAIL);
  let userId: string;

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'super_admin' },
    });
    if (error) {
      console.error('Error actualizando usuario:', error.message);
      process.exit(1);
    }
    userId = existing.id;
    console.log(`Usuario existente actualizado: ${EMAIL}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'super_admin' },
    });
    if (error || !data.user) {
      console.error('Error creando usuario:', error?.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`Usuario creado: ${EMAIL}`);
  }

  const { error: profileError } = await supabase
    .from('admin_users')
    .upsert(
      {
        id: userId,
        email: EMAIL,
        full_name: FULL_NAME,
        role: 'super_admin',
        is_active: true,
      },
      { onConflict: 'id' }
    );

  if (profileError) {
    console.error('Error creando perfil admin:', profileError.message);
    process.exit(1);
  }

  console.log('Perfil admin listo.');
  console.log('');
  console.log(`  URL:      ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:54900'}/login`);
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
}

main();
