/**
 * Simulacion punta a punta de la conversacion objetivo, contra el codigo de hoy.
 *
 * Siembra el catalogo de FYMSA --dos desarrollos, cinco modelos y terrenos-- con
 * el contenido que un compilador ideal habria producido: intenciones propias por
 * alcance y respuestas en el nivel donde vive el dato. Despues manda los turnos
 * de la conversacion aprobada y imprime lo que el bot contesta de verdad.
 *
 * El objetivo es separar dos preguntas que se confunden: si el runtime puede
 * sostener la conversacion, y si el compilador puede producir el contenido que
 * la sostiene. Sembrando el contenido a mano, lo que falle es del runtime.
 *
 * No deja nada: desactiva los desarrollos existentes mientras corre y los
 * restaura al terminar.
 *
 *   npx tsx scripts/simulate-fymsa.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withFymsaFixture } from './helpers/fymsa-fixture';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  console.error('Solo contra Supabase local');
  process.exit(1);
}

const suffix = randomUUID().slice(0, 6);

async function main() {
  const { messageProcessor } = await import('../src/core/conversation/message-processor');
  const { offerButtons } = await import('../src/core/conversation/pending-offer-messages');
  const phone = `sim${Date.now().toString(36)}`;

  await withFymsaFixture(async repository => {
    const turns = [
      'Hola',
      '¿Cuánto cuestan?',
      'Europa',
      'Solara',
      '¿Dónde está?',
      '¿Qué amenidades tiene?',
      '¿Y en Altabrisa cuánto cuesta?',
      'precio de Cala',
      '¿cuál es la más barata de Europa con 3 recámaras?',
      'Quiero agendar',
    ];

    console.log('\n================ CONVERSACION SIMULADA ================\n');
    for (let index = 0; index < turns.length; index += 1) {
      const text = turns[index];
      const result = await messageProcessor.processMessage(
        phone,
        text,
        `wamid.sim-${suffix}-${index}`,
        'Simulacion',
        { suppressExternalMessages: true }
      );
      const replies = Array.isArray(result?.responses)
        ? result.responses
        : [JSON.stringify(result)];
      console.log(`Lead  ${text}`);
      for (const reply of replies) {
        const body = typeof reply === 'string' ? reply : JSON.stringify(reply);
        console.log(`Bot   ${body.replace(/\n/g, '\n      ')}`);
      }
      const userId = await repository.getSimulationUserId(phone);

      // Las opciones no viajan en el texto: quien las enseña es el transporte.
      // El recorrido de aceptacion tiene que enseñar lo que ve el lead, o la
      // pregunta se lee como si no ofreciera nada.
      const buttons = await offerButtons(userId, '');
      if (buttons.length > 0) {
        console.log(`      ${buttons.map(button => `[ ${button.title} ]`).join('  ')}`);
      }

      const { focusName, pendingScopeMessage } = await repository.getSimulationFocus(userId);
      console.log(`      [foco: ${focusName || 'ninguno'} | pendiente: ${pendingScopeMessage || 'ninguna'} | fallback: ${result?.isFallback ? 'si' : 'no'}]`);
      console.log('');
    }
  }, { suffix, phone });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
