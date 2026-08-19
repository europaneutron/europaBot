import { configRepository } from '@/data/repositories/config.repository';
import { clientBrandRepository } from '@/data/repositories/client-brand.repository';
import { renderClientBrand } from '@/core/onboarding/client-vocabulary';
import { interpolateMessage, type MessageVariables } from '@/lib/interpolate-message';

/**
 * Punto único donde un mensaje configurable se convierte en el texto que sale.
 *
 * Son tres pasos que siempre van juntos —leer el valor, poner la palabra del
 * cliente, sustituir las variables— y separarlos deja que diverjan. Antes cada
 * consumidor envolvía el `get` a mano: de los seis mensajes sembrados que
 * mencionan el tipo de proyecto, cinco recibían el vocabulario y uno no, y dos
 * de los cinco no debían recibirlo porque contienen el nombre propio del
 * cliente. Es la misma dispersión que ya costó una ronda con la interpolación.
 *
 * Quien agregue un mensaje nuevo lo pide por aquí y hereda las tres reglas.
 */
export async function resolveConfiguredMessage(
  key: string,
  fallback: string,
  variables: MessageVariables = {}
): Promise<string> {
  const template = await resolveConfiguredTemplate(key, fallback);
  const interpolation = interpolateMessage(template, variables);
  if (interpolation.complete) return interpolation.value;

  // Un hueco que nadie rellena salia tal cual al lead: quien escribio el
  // mensaje puso `{alcances}` en uno que no lo recibe y el lead leia
  // "{alcances}". Aqui se cae al texto de fabrica, que siempre cuadra con lo
  // que este mensaje recibe, y se deja constancia de la clave para poder
  // corregirla en Ajustes.
  console.error(
    `El mensaje "${key}" usa variables que no recibe: ${interpolation.missingKeys.join(', ')}.`
    + ' Se envia el texto de fabrica.'
  );
  return interpolateMessage(fallback, variables).value;
}

/**
 * Igual, pero deja las variables sin sustituir.
 *
 * Es para el caso en que la plantilla se carga una vez y se personaliza muchas
 * veces, como el seguimiento de un lote de leads: el vocabulario es el mismo
 * para todos y el nombre no. Interpolar aqui borraria `{nombre}` antes de que
 * cada destinatario ponga el suyo.
 */
export async function resolveConfiguredTemplate(
  key: string,
  fallback: string
): Promise<string> {
  const [template, brand] = await Promise.all([
    configRepository.get(key, fallback),
    clientBrandRepository.get(),
  ]);

  return renderClientBrand(template, brand);
}
