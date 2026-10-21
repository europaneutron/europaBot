import { config } from 'dotenv';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { checkMoneyAmounts, extractMoneyAmounts, collectCatalogMoneyAmounts, collectTextMoneyAmounts, describeMoneyRetry } from '../src/core/ai-conversation/guards/money-guard';
import { formatForWhatsApp } from '../src/core/ai-conversation/guards/whatsapp-format';

config({ quiet: true, path: resolve(process.cwd(), '.env.development.local') });
config({ quiet: true, path: resolve(process.cwd(), '.env.local') });

const catalog = [2_350_000, 780_000, 1_800_000];
for (const text of ['$2,350,000', '2.35 millones', '2,350 mil', '$780K', '1.8 mdp', '$2.35 millones', '2,35 millones', '2350000 pesos', 'MXN 2,350,000']) {
  const result = checkMoneyAmounts(text, catalog);
  assert.equal(result.found.length, 1, text);
  assert.equal(result.valid, true, text);
}
assert.deepEqual(extractMoneyAmounts('$2,350,000; $780K y 1.8 mdp').map(item => item.amount), catalog);
assert.equal(checkMoneyAmounts('Precio $2,350,000 y apartado $999', catalog).invalid[0].amount, 999);
assert.equal(checkMoneyAmounts('$-780000', catalog).valid, false);
assert.equal(checkMoneyAmounts('2.35 millones', [2_354_000]).valid, true);
assert.equal(checkMoneyAmounts('2.35 millones', [2_356_000]).valid, false);
assert.equal(checkMoneyAmounts('$2,350,000', [2_354_000]).valid, false);
assert.equal(checkMoneyAmounts('2.350 millones', [2_351_000]).valid, false);
assert.equal(checkMoneyAmounts('3 recámaras, 120 m2, 15 m de frente, a las 10:30', []).found.length, 0);
assert.equal(checkMoneyAmounts('$780K', []).valid, false);

const allowed = collectCatalogMoneyAmounts([
  { value_type: 'text', value: '$1,850,000', unit: null },
  { value_type: 'text', value: ['2.35 millones', '780 mil', '1.8 mdp'], unit: null },
  { value_type: 'money', value: 1420000, unit: null },
  { value_type: 'money', value: '1,780,000', unit: null },
  { value_type: 'number', value: '$2,980,000', unit: null },
  { value_type: 'number', value: 2340000, unit: 'MXN' },
  { value_type: 'number', value: 3, unit: null },
  { value_type: 'text', value: '3', unit: null },
  { value_type: 'number', value: 160, unit: 'm2' },
  { value_type: 'text', value: ['160 m2', '3 recámaras', '15 m de frente'], unit: null },
  { value_type: 'money', value: true, unit: null },
  { value_type: 'money', value: 'pendiente', unit: null },
]);
assert.deepEqual(allowed, [780000, 1420000, 1780000, 1800000, 1850000, 2340000, 2350000, 2980000]);
assert.equal(checkMoneyAmounts('Desde $1,850,000', allowed).valid, true);
assert.equal(checkMoneyAmounts('Desde $1,999,000', allowed).valid, false);
assert.equal(checkMoneyAmounts('Cuesta $3 o $160', allowed).invalid.length, 2);
assert.deepEqual(collectCatalogMoneyAmounts([
  { value_type: 'money', value: [1850000, '$1,850,000', '1850000'], unit: null },
]), [1850000]);
assert.deepEqual(collectCatalogMoneyAmounts([
  { value_type: 'money', value: 2.35, unit: 'millones' },
]), [2350000]);

const prices = { catalog: [2_350_000, 1_220_000, 780_000] };
// Cifras que escribió la persona o que ya están en la guía
assert.equal(checkMoneyAmounts('Con 20 mil apartas', { ...prices, quoted: collectTextMoneyAmounts(['vi que con 20mil apartaban']) }).valid, true);
assert.equal(checkMoneyAmounts('Con $20,000 apartas', { ...prices, quoted: collectTextMoneyAmounts(['con 20 mil']) }).valid, true);
assert.equal(checkMoneyAmounts('Con $20,000 apartas', prices).valid, false);
assert.equal(checkMoneyAmounts('El apartado es de $5,000', { ...prices, quoted: collectTextMoneyAmounts(['## Europa\napartado: Aparta con $5,000 pesos']) }).valid, true);
assert.equal(checkMoneyAmounts('Son $30,000', { ...prices, quoted: [20_000, 5_000] }).valid, false, 'las cifras de la persona no se suman');
// Diferencias y sumas de dos valores del catálogo
assert.equal(checkMoneyAmounts('La Solara cuesta $1,130,000 más', { catalog: [2_350_000, 1_220_000] }).valid, true);
assert.equal(checkMoneyAmounts('Son 1.13 millones de diferencia', { catalog: [2_350_000, 1_220_000] }).valid, true);
assert.equal(checkMoneyAmounts('Juntas suman $3,570,000', { catalog: [2_350_000, 1_220_000] }).valid, true);
assert.equal(checkMoneyAmounts('Diferencia de $1,131,000', { catalog: [2_350_000, 1_220_000] }).valid, false);
assert.equal(checkMoneyAmounts('Cuesta $4,920,000', { catalog: [2_350_000, 1_220_000, 1_350_000] }).valid, false, 'tres valores no');
assert.equal(checkMoneyAmounts('Cuesta $1,130,000', { catalog: [2_350_000], quoted: [1_220_000] }).valid, false, 'la derivación parte solo del catálogo');
assert.equal(checkMoneyAmounts('Cuesta $2,350,000', [2_350_000]).valid, true);
const retryFact = describeMoneyRetry(checkMoneyAmounts('Cuesta $999', prices).invalid, { ...prices, quoted: [20_000] });
assert(retryFact.includes('$999') && retryFact.includes('$780,000') && retryFact.includes('$20,000'), retryFact);
assert(/No menciones esta revisión ni te disculpes/.test(retryFact) && !/lo siento|perd[oó]n/i.test(retryFact));

const formatted = formatForWhatsApp('# Opciones\n**Europa**\n[Ubicación](https://maps.example/a_(b))\n\n| Modelo | Precio |\n| :--- | ---: |\n| Solara | $2,350,000 |\n\nFin');
assert.equal(formatted.text, 'Opciones\n*Europa*\nUbicación: https://maps.example/a_(b)\n\nModelo: Solara; Precio: $2,350,000\n\nFin');
assert.deepEqual(new Set(formatted.fixes), new Set(['markdown_links', 'headers', 'tables', 'bold']));
assert.deepEqual(formatForWhatsApp('Texto\n\n*negrita*'), { text: 'Texto\n\n*negrita*', fixes: [] });
assert.equal(formatForWhatsApp('Modelo | Precio\n--- | ---\nAura | $780K').text, 'Modelo: Aura; Precio: $780K');
assert.equal(formatForWhatsApp('Título\n===\nTexto').text, 'Título\nTexto');
assert.equal(formatForWhatsApp('Una opción | otra\nTexto').text, 'Una opción | otra\nTexto');
assert.deepEqual(formatForWhatsApp(formatted.text).fixes, []);
assert.equal(formatForWhatsApp('**Dos\nlíneas**').text, '*Dos\nlíneas*');
console.log('Guardas de dinero y formato: verificaciones correctas.');
