/**
 * La forma del mensaje: la lista se despliega con vinetas y una respuesta que
 * no cabe en el cuerpo interactivo se parte en vez de perderse.
 *
 * Ninguna de las dos llama al modelo: la lista es del catalogo y el corte es
 * del transporte.
 *
 *   npx tsx scripts/test-message-shape.ts
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
  const { formatCatalogValue, formatCatalogValueForProse } = await import(
    '../src/data/repositories/catalog-value.repository'
  );
  const { splitForInteractiveBody, INTERACTIVE_BODY_MAX_LENGTH } = await import(
    '../src/core/conversation/pending-offer-messages'
  );

  console.log('\n1. Una lista de tres o mas se despliega con vinetas');
  const amenidades = {
    value: ['Alberca', 'Casa club', 'Area de juegos', 'Gimnasio'],
    value_type: 'text' as const,
    unit: null,
  };
  const prose = formatCatalogValueForProse(amenidades);
  assert(
    prose === '• Alberca\n• Casa club\n• Area de juegos\n• Gimnasio',
    `cuatro amenidades salen una por linea:\n${prose}`
  );
  assert(
    formatCatalogValue(amenidades) === 'Alberca, Casa club, Area de juegos y Gimnasio',
    'la pantalla del catalogo y las etiquetas siguen leyendo "a, b y c"'
  );

  console.log('\n2. Dos elementos se leen mejor en linea que en vinetas');
  const dos = { value: ['Contado', 'Credito bancario'], value_type: 'text' as const, unit: null };
  assert(
    formatCatalogValueForProse(dos) === 'Contado y Credito bancario',
    'dos elementos siguen en linea: "Contado y Credito bancario"'
  );

  console.log('\n3. Un valor suelto no cambia');
  const precio = { value: '2980000', value_type: 'money' as const, unit: 'MXN' };
  assert(
    formatCatalogValueForProse(precio) === formatCatalogValue(precio),
    `un importe se rinde igual que siempre: ${formatCatalogValueForProse(precio)}`
  );

  console.log('\n4. Una respuesta que cabe viaja entera');
  const corta = 'Se ubica en Avenida Europa 100.\n¿Te comparto como llegar?';
  const cabe = splitForInteractiveBody(corta);
  assert(cabe !== null && cabe.precedingText === undefined, 'no se parte lo que ya cabe');
  assert(cabe!.bodyText === corta, 'el cuerpo es el texto completo');

  console.log('\n5. Una respuesta larga se parte por su cierre');
  const larga = `${'Detalle del desarrollo. '.repeat(60)}\n¿Te gustaria agendar una visita?`;
  assert(larga.length > INTERACTIVE_BODY_MAX_LENGTH, `la respuesta de prueba pasa del limite: ${larga.length}`);
  const partida = splitForInteractiveBody(larga);
  assert(partida !== null, 'una respuesta larga se puede presentar');
  assert(
    partida!.bodyText === '¿Te gustaria agendar una visita?',
    'los botones quedan pegados al cierre que los pide'
  );
  assert(
    partida!.precedingText?.startsWith('Detalle del desarrollo.') === true,
    'el resto viaja antes, como mensaje suelto'
  );
  assert(
    partida!.bodyText.length <= INTERACTIVE_BODY_MAX_LENGTH,
    'el cuerpo que se manda cabe en lo que WhatsApp admite'
  );

  console.log('\n6. Sin corte posible, no se inventa un cuerpo');
  const sinCierre = 'x'.repeat(INTERACTIVE_BODY_MAX_LENGTH + 1);
  assert(
    splitForInteractiveBody(sinCierre) === null,
    'una sola linea larguisima se manda plana en vez de con un cuerpo inventado'
  );
}

main()
  .then(() => console.log('\nForma del mensaje verificada: vinetas en la lista y corte por el cierre'))
  .catch(error => { console.error(error); process.exit(1); });
