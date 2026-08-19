/**
 * Pedir otra opcion se comprueba antes que el matcher, asi que un falso
 * positivo se traga la pregunta entera. Buscar la palabra en cualquier parte
 * del mensaje lo hacia constantemente, y uno de esos casos rompia los
 * checkpoints: "tengo otra pregunta" se desviaba antes de contarse.
 *
 *   npx tsx scripts/test-sibling-request.ts
 */
import { isSiblingRequest } from '../src/core/conversation/sibling-request';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`OK: ${message}`);
}

console.log('\n1. Pedir otro de verdad');
for (const phrase of [
  '¿y el otro?', 'el otro', 'otro', 'y los demás', 'que mas tienen',
  '¿qué más hay?', 'mas opciones', 'alternativas', 'muéstrame otra',
]) {
  assert(isSiblingRequest(phrase), `"${phrase}" pide otra opcion`);
}

console.log('\n2. Preguntas normales que llevan la palabra dentro');
for (const phrase of [
  '¿tienen otra forma de pago?',
  '¿hay otro modelo disponible?',
  'quiero otro credito',
  'información beta, tengo otra pregunta',
  '¿me das otra opción de financiamiento?',
  '¿aceptan otras formas de pago?',
]) {
  assert(!isSiblingRequest(phrase), `"${phrase}" NO pide otra opcion: va al matcher`);
}

console.log('\n3. Lo que nunca lo fue');
for (const phrase of ['cuanto cuesta', 'donde estan', '', 'hola']) {
  assert(!isSiblingRequest(phrase), `"${phrase}" no lo pide`);
}

console.log('\nDeteccion de "otro" verificada: cierra el mensaje o no cuenta');
