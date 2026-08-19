/**
 * El colapso de unidad repetida no toca la base de datos: es una funcion
 * pura sobre texto. Este script no necesita Supabase local ni deja datos
 * temporales, a diferencia de los demas scripts test-*.ts del proyecto.
 */
import { interpolateMessage } from '../src/lib/interpolate-message';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`OK: ${message}`);
}

function main() {
  let result = interpolateMessage('{medio_bano} medio bano', { medio_bano: '1 medio bano' });
  assert(
    result.value === '1 medio bano',
    `unidad de varias palabras: "1 medio bano medio bano" colapsa a "${result.value}"`
  );

  result = interpolateMessage('Tiene {casas} casas', { casas: '96 casas' });
  assert(
    result.value === 'Tiene 96 casas',
    `unidad de una palabra: "96 casas casas" colapsa a "${result.value}"`
  );

  result = interpolateMessage('Ya ya veremos', {});
  assert(
    result.value === 'Ya ya veremos',
    `repeticion escrita en la plantilla se respeta: "${result.value}"`
  );

  result = interpolateMessage('Terreno de {terreno}', { terreno: '250 m2' });
  assert(
    result.value === 'Terreno de 250 m2',
    `sin repeticion no hay nada que colapsar: "${result.value}"`
  );

  // Un valor de varias lineas no casaba con las marcas de sustitucion --el
  // punto de la expresion no cruza saltos de linea-- asi que se quedaban
  // puestas y el lead recibia dos caracteres nulos envolviendo la lista. Es
  // justo la forma de {alcances}, la variable del unico mensaje del sistema
  // que sigue escribiendose a mano.
  result = interpolateMessage('Manejamos {alcances}. ¿Cual?', {
    alcances: '- Europa\n- Malasia',
  });
  assert(
    result.value === 'Manejamos - Europa\n- Malasia. ¿Cual?',
    `un valor de varias lineas sale limpio: ${JSON.stringify(result.value)}`
  );

  console.log('\nTodas las pruebas de colapso de unidad pasaron.');
}

main();
