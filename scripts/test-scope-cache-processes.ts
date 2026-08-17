import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  throw new Error('Este script solo puede escribir contra Supabase local');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`OK: ${message}`);
}

type Worker = {
  process: ChildProcessWithoutNullStreams;
  request(command: Record<string, unknown>): Promise<any>;
};

function startWorker(): Worker {
  const child = spawn(process.execPath, [
    '--import',
    'tsx',
    resolve(process.cwd(), 'scripts/helpers/scope-cache-worker.ts'),
  ], { cwd: process.cwd() });
  const pending: Array<{ resolve(value: any): void; reject(error: Error): void }> = [];
  createInterface({ input: child.stdout }).on('line', line => {
    if (!line.startsWith('RESULT ')) return;
    const request = pending.shift();
    if (!request) return;
    const result = JSON.parse(line.slice('RESULT '.length));
    if (result.error) request.reject(new Error(result.error));
    else request.resolve(result);
  });
  createInterface({ input: child.stderr }).on('line', line => {
    if (line.trim()) console.error(line);
  });
  child.on('exit', code => {
    if (code === 0) return;
    while (pending.length > 0) pending.shift()!.reject(new Error(`El proceso de caché terminó con código ${code}`));
  });
  return {
    process: child,
    request(command) {
      return new Promise((resolveRequest, reject) => {
        pending.push({ resolve: resolveRequest, reject });
        child.stdin.write(`${JSON.stringify(command)}\n`);
      });
    },
  };
}

/**
 * La version se lee de la base, no de un reloj, y resolver un mensaje toca el
 * arbol dos docenas de veces. Preguntarla en cada una son veinticinco viajes
 * por mensaje en un webhook que ya bloquea mientras envia.
 */
async function verifyOneReadPerMessage() {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { scopeRepository } = await import('../src/data/repositories/scope.repository');
  const { withContentVersionScope } = await import('../src/lib/server/content-version-scope');
  const { messageProcessor } = await import('../src/core/conversation/message-processor');

  const originalFrom = supabaseServer.from.bind(supabaseServer);
  let reads = 0;
  (supabaseServer as any).from = (table: string) => {
    if (table === 'scope_tree_version') reads += 1;
    return originalFrom(table);
  };

  const phone = `52199${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
  try {
    await messageProcessor.processMessage(phone, 'hola', `cache_${Date.now()}`, 'Cache', {
      suppressExternalMessages: true,
    });
    reads = 0;
    await messageProcessor.processMessage(phone, 'cuanto cuesta', `cache_${Date.now()}`, 'Cache', {
      suppressExternalMessages: true,
    });
    assert(reads === 1, `un mensaje lee la versión del árbol una sola vez (leyó ${reads})`);

    // Fijarla por mensaje no puede volver a la caché por tiempo: lo que se
    // escribe entre un mensaje y el siguiente tiene que verse en el siguiente.
    const first = await withContentVersionScope(() => scopeRepository.getContentVersion());
    const { data: created, error } = await supabaseServer.from('scopes').insert({
      parent_id: null,
      name: `Version Probe ${randomUUID().slice(0, 8)}`,
      slug: `version-probe-${randomUUID().slice(0, 8)}`,
      is_active: false,
    }).select('id').single();
    if (error) throw error;
    const second = await withContentVersionScope(() => scopeRepository.getContentVersion());
    await supabaseServer.from('scopes').delete().eq('id', created.id);
    assert(second > first, 'el mensaje siguiente sí ve lo que se escribió entre los dos');
  } finally {
    (supabaseServer as any).from = originalFrom;
    const { data: user } = await supabaseServer.from('users').select('id').eq('phone_number', phone).single();
    if (user) {
      await supabaseServer.from('conversations').delete().eq('user_id', user.id);
      await supabaseServer.from('scope_progress').delete().eq('user_id', user.id);
      await supabaseServer.from('users').delete().eq('id', user.id);
    }
  }
}

async function main() {
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const suffix = randomUUID().slice(0, 8);
  const reader = startWorker();
  const writer = startWorker();
  let scopeId: string | null = null;

  try {
    await reader.request({ action: 'load' });
    const created = await writer.request({
      action: 'create',
      parentId: ROOT_SCOPE_ID,
      name: `Process Cache ${suffix}`,
      slug: `process-cache-${suffix}`,
    });
    scopeId = created.id;

    const visible = await reader.request({ action: 'get', id: scopeId });
    assert(visible.found && visible.active, 'un proceso ve de inmediato el alcance creado por otro');

    await writer.request({ action: 'deactivate', id: scopeId });
    const inactive = await reader.request({ action: 'get', id: scopeId });
    assert(inactive.found && inactive.active === false, 'un proceso deja de ofrecer lo que otro desactiva');

    await verifyOneReadPerMessage();
  } finally {
    if (scopeId) await writer.request({ action: 'delete', id: scopeId });
    reader.process.stdin.write('{"action":"exit"}\n');
    writer.process.stdin.write('{"action":"exit"}\n');
  }
}

main()
  .then(() => console.log('Scope cache multi-process verification completed'))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

