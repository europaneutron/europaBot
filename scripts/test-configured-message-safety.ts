/**
 * Un mensaje configurable no puede salir con un hueco sin rellenar.
 *
 * La descripcion de `scope_disambiguation_message` prometia {alcances} y el
 * codigo no se lo pasaba, asi que quien lo escribia siguiendo la ayuda mandaba
 * "{alcances}" a un lead. Ahora esa variable si llega, y si alguien usa una
 * que no existe se envia el texto de fabrica en vez del hueco.
 *
 *   npx tsx scripts/test-configured-message-safety.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`OK: ${message}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error('Este script solo puede escribir contra Supabase local');
  }

  const { configRepository } = await import('../src/data/repositories/config.repository');
  const { resolveConfiguredMessage } = await import('../src/core/messaging/configured-message');

  const KEY = 'scope_disambiguation_message';
  const original = await configRepository.get(KEY, '');

  try {
    console.log('\n1. La variable que la ayuda promete llega de verdad');
    await configRepository.set(KEY, 'Tenemos {alcances}. ¿Cuál te interesa?');
    const rendered = await resolveConfiguredMessage(KEY, '¿De cuál?', { alcances: 'Europa y Malasia' });
    assert(
      rendered === 'Tenemos Europa y Malasia. ¿Cuál te interesa?',
      `se sustituye: "${rendered}"`
    );

    console.log('\n2. Una variable que no existe no llega al lead');
    await configRepository.set(KEY, 'Mira {inventada} y elige.');
    const safe = await resolveConfiguredMessage(KEY, '¿De cuál te gustaría recibir información?', {});
    assert(!safe.includes('{'), `no sale ningun hueco a la vista: "${safe}"`);
    assert(
      safe === '¿De cuál te gustaría recibir información?',
      'se envia el texto de fabrica, que siempre cuadra'
    );

    console.log('\n3. Las del negocio siguen funcionando en cualquier mensaje');
    await configRepository.set(KEY, '¿Sobre cuál {project_singular} te cuento?');
    const brand = await resolveConfiguredMessage(KEY, '¿De cuál?', {});
    assert(!brand.includes('{project_singular}'), `se sustituye el vocabulario: "${brand}"`);
  } finally {
    await configRepository.set(KEY, original);
  }
}

main()
  .then(() => console.log('\nMensajes configurables verificados: ningun hueco llega al lead'))
  .catch(error => { console.error(error); process.exit(1); });
