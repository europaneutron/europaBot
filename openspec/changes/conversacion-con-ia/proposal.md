## Why

El bot contesta con un matcher léxico y un árbol de respuestas con botones. En el respaldo de producción del 31-ago (3,574 leads, todos anteriores al árbol), solo el 2.4% llegó a hot y el 15.6% a warm. La mediana fue de 2 a 3 mensajes por lead, y cerca del 30% se fue tras un mensaje o ninguno. La percepción del negocio es que con el árbol bajó todavía más: el lead se queda en el primer paso.

Ese bot no usaba IA. Lo que se sentía natural era que contestaba directo a lo que se escribía. El árbol agregó pasos intermedios ("¿de cuál desarrollo?", botones), y además mide peor el interés: un toque de botón o una pregunta de desambiguación no da puntos.

Un modelo de lenguaje resuelve las dos cosas. Entiende texto libre sin patrones y recuerda la conversación sin estado guardado. El contenido ya existe y es poco: árbol de alcances, catálogo y respuestas caben completos en el prompt, sin búsqueda por similitud.

Este cambio revierte a propósito la decisión del 2026-08-16, "el runtime no lleva LLM". Los datos de arriba justifican revisarla, y la condición es la misma que se puso para la cita con IA: el modelo interpreta, el código afirma.

## What Changes

- **Contestador con Claude Haiku 5.5** como camino nuevo del mensaje entrante, detrás de un interruptor en `bot_config`. Con el interruptor apagado, el bot se comporta exactamente como hoy.
- **Contexto armado desde lo que ya existe**, sin migrar contenido: persona, capacidades, árbol de alcances con catálogo (cada dato con su ruta completa) y respuestas actuales interpoladas como preguntas frecuentes. Se excluyen en código las respuestas con huecos sin llenar y las de navegación.
- **Sin foco de conversación en el camino con IA.** El árbol se queda como organización del contenido. El desarrollo del que se habla lo entrega el modelo como parámetro de una lista cerrada, en las tools y en el clasificador.
- **Tools que llaman a código existente:** agendar cita (flujo actual o WhatsApp Flow), hablar con asesor, enviar brochure. El modelo solo puede afirmar una acción si la tool regresó éxito.
- **Clasificador de temas en una llamada aparte, en paralelo.** Lista cerrada de temas (los intents marcados como checkpoint), cita textual verificada en código y claridad en dos niveles. Solo "clara" suma al score.
- **Score por lead y por tema,** no por alcance. La política de oferta de cita (`shouldOfferAppointment`) se reutiliza sin cambios y se entrega al modelo como nota del turno.
- **Guardas deterministas sobre la salida:** toda cifra de dinero debe existir en el catálogo, se limpia el formato para WhatsApp antes de enviar, y si el modelo falla o tarda contesta el bot léxico actual.
- **Persona guiada en Ajustes:** nombre del asistente, tratamiento, emojis, largo de respuesta y un texto libre corto. El bot admite que es un asistente si se lo preguntan.
- **Medición con frases reales:** simulador sobre textos de leads del respaldo, calibración del clasificador contra una muestra etiquetada a mano, y registro de la señal del matcher en paralelo para comparar el score antes y después.

**Fuera de alcance de este cambio:**

- Botones en el camino con IA. La fase 1 contesta solo texto. Los accesos fijos de cita y asesor, puestos por código, quedan para una fase 2 si la medición los pide.
- Captar datos de calificación (presupuesto, forma de pago, plazo de compra).
- Modo de índice más consulta para catálogos grandes. El constructor de contexto queda preparado para él, pero no se activa.
- Retirar el foco, los botones manuales o el matcher del código. Siguen vivos como respaldo.
- Unificar la edición de contenido en una sola "ficha" en el panel.
- Separación de entornos (Supabase de staging, App de Meta de prueba, variables de Preview en Vercel). Es requisito para probar en WhatsApp real, no para construir ni medir en local.
- Separación por tenant.

## Capabilities

### New Capabilities

- `ai-conversation`: el contestador con modelo de lenguaje. Interruptor, armado del contexto, persona, tools, guardas de salida y respaldo al bot léxico.
- `topic-classification`: detección de temas de interés en el mensaje del lead, con lista cerrada, evidencia verificada y claridad, y su conexión al lead score y a la oferta de cita.

### Modified Capabilities

Ninguna. `response-composer` describe cómo se compone una respuesta configurada en el camino léxico, y ese camino no cambia.

## Impact

**Base de datos**

- Migraciones aditivas: claves de `bot_config` para el interruptor, el modelo y los campos de la persona.
- Registro por mensaje de la salida del clasificador (temas, cita, claridad, otro tema) y de la señal del matcher, para medir.
- Registro de llamadas al modelo: tokens, latencia, causa de respaldo.

**Código**

- Nuevo `src/core/ai-conversation/`: armado del contexto, contestador, clasificador y guardas.
- `src/core/conversation/message-processor.ts`: punto de bifurcación hacia el camino con IA cuando el interruptor está encendido.
- `src/data/repositories/`: lectura del contenido completo del árbol para armar el contexto, e historial reciente.
- Panel de Ajustes: sección de persona.
- Dependencia nueva: `@anthropic-ai/sdk`.

**Entornos y operación**

- Variable `ANTHROPIC_API_KEY` en `.env.example`, `.env.development.local` y, al desplegar, en Vercel.
- Costo estimado con Haiku 5.5 y caché: alrededor de una décima de centavo de dólar por mensaje.

**Documentos**

- `openspec/conversacion-objetivo.md` dice hoy "el runtime no lleva LLM". Se actualiza para el camino con IA: los mismos turnos son el criterio, pero se aceptan respuestas en prosa sin botones.
