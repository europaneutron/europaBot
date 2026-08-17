import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  throw new Error('Este proceso solo puede operar contra Supabase local');
}

async function start() {
  const { supabaseServer } = await import('../../src/services/supabase/server-client');
  const { scopeRepository } = await import('../../src/data/repositories/scope.repository');

  const input = createInterface({ input: process.stdin });
  input.on('line', async line => {
    try {
      const command = JSON.parse(line);
      if (command.action === 'load') {
        const scopes = await scopeRepository.getScopes(supabaseServer);
        console.log(`RESULT ${JSON.stringify({ count: scopes.length })}`);
        return;
      }
      if (command.action === 'create') {
        const scope = await scopeRepository.create({
          parent_id: command.parentId,
          name: command.name,
          slug: command.slug,
          scope_type: 'opcion',
        }, supabaseServer);
        console.log(`RESULT ${JSON.stringify({ id: scope.id })}`);
        return;
      }
      if (command.action === 'get') {
        const scopes = await scopeRepository.getScopes(supabaseServer);
        const scope = scopes.find(row => row.id === command.id);
        console.log(`RESULT ${JSON.stringify({ found: Boolean(scope), active: scope?.is_active })}`);
        return;
      }
      if (command.action === 'deactivate') {
        const { error } = await supabaseServer
          .from('scopes')
          .update({ is_active: false })
          .eq('id', command.id);
        if (error) throw error;
        console.log('RESULT {"ok":true}');
        return;
      }
      if (command.action === 'delete') {
        await scopeRepository.deleteEmpty(command.id, supabaseServer);
        console.log('RESULT {"ok":true}');
        return;
      }
      if (command.action === 'exit') process.exit(0);
    } catch (error) {
      console.log(`RESULT ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}`);
    }
  });
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
