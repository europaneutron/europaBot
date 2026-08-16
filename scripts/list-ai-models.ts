/**
 * Lista los modelos que la llave configurada puede invocar realmente.
 *
 * El modelo es un parametro de texto en la peticion, pero no es texto libre:
 * tiene que nombrar un identificador existente al que la cuenta tenga acceso.
 * Un nombre inventado no falla al guardarlo, falla al compilar, y para entonces
 * el error aparece enterrado en last_error de una ejecucion.
 *
 * Ejecutar con: npx tsx scripts/list-ai-models.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { configRepository } = await import('../src/data/repositories/config.repository');
  const { getOpenAIClient } = await import('../src/services/ai/openai.service');

  const apiKey = await configRepository.getVaultSecret('openai_api_key');
  if (!apiKey) {
    console.error('No hay clave de OpenAI configurada en este entorno.');
    console.error('Guardala desde Ajustes > Inteligencia Artificial y vuelve a ejecutar.');
    process.exit(1);
  }

  const openai = await getOpenAIClient();
  const models = await openai.models.list();
  const ids = models.data.map(model => model.id).sort();

  console.log(`\n${ids.length} modelos disponibles para esta llave:\n`);
  for (const id of ids) console.log(`  ${id}`);

  const configured = {
    ai_model: await configRepository.get('ai_model', ''),
    ai_extraction_model: await configRepository.get('ai_extraction_model', ''),
    ai_writing_model: await configRepository.get('ai_writing_model', ''),
  };

  console.log('\nModelos configurados hoy:\n');
  let missing = false;
  for (const [key, value] of Object.entries(configured)) {
    const exists = ids.includes(value);
    if (!exists) missing = true;
    console.log(`  ${key.padEnd(22)} ${value.padEnd(24)} ${exists ? 'existe' : 'NO EXISTE'}`);
  }

  if (missing) {
    console.log('\nAl menos un modelo configurado no existe: la compilacion fallaria con 404.');
    process.exit(1);
  }
  console.log('\nTodos los modelos configurados existen.');
}

main().catch(error => {
  console.error('No fue posible consultar los modelos:', error.message || error);
  process.exit(1);
});
