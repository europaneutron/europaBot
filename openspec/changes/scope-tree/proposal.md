## Why

El bot atiende un solo desarrollo inmobiliario. El cliente quiere vender un segundo proyecto desde el mismo número de WhatsApp, con su propio catálogo de preguntas, sus propias respuestas y su propio embudo. Hoy eso es imposible: `intent_configurations.intent_name` es único a nivel global, cada intent tiene una sola respuesta, y no existe ningún concepto que distinga de qué proyecto se está hablando.

Además, el producto se vende por tenant a inmobiliarias, que típicamente manejan varios desarrollos a la vez. Sin esta pieza, cada cliente nuevo con más de un proyecto queda fuera del alcance del producto.

## What Changes

- Nueva entidad `scopes`: un árbol auto-referenciado donde cada nodo representa un contexto en el que un conjunto de respuestas es válido. Un desarrollo es un nodo; la raíz agrupa lo común a todos.
- Resolución por herencia: al buscar el contenido de una intención se parte del nodo activo y se sube por el árbol hasta el primer resultado. Lo que es cierto para todos los hijos se define una sola vez en el padre.
- Intents y respuestas acotados por alcance, con `scope_id` nulo para lo global (`saludo`, `horario`, `asesor`), que no debe duplicarse por desarrollo.
- **BREAKING** El identificador de una intención deja de ser único a nivel global: pasa a serlo dentro de su alcance. `bot_responses` deja de referenciar la intención por nombre y pasa a referenciarla por identificador.
- Recursos acotados por alcance, para que cada desarrollo tenga su propio brochure.
- La configuración también hereda por el árbol: horarios, asesores y umbrales se resuelven con el mismo mecanismo que las respuestas, de modo que definir un asesor por desarrollo no requiera cambios de esquema más adelante.

**Fuera de alcance de este cambio:**

- Pantallas de administración del árbol. Los nodos se siembran por SQL para las pruebas; la gestión visual llega en un cambio posterior con su propio riesgo acotado.
- Detección del alcance a partir del mensaje o del anuncio, y el foco de conversación. Corresponde al cambio `scope-routing`.
- Checkpoints, lead score y citas por alcance. Corresponde al cambio `scope-progress`.

Con un solo nodo raíz, el comportamiento observable del bot es idéntico al actual.

## Capabilities

### New Capabilities

- `scope-resolution`: modelo de alcances jerárquicos y resolución por herencia del contenido y la configuración que el bot usa para responder.

### Modified Capabilities

Ninguna. `response-composer` no cambia sus requisitos: el compositor sigue editando la misma estructura de respuesta, solo que la respuesta pertenece a un alcance.

## Impact

**Base de datos**

- Migraciones nuevas a partir de la 025, estrictamente aditivas. La secuencia completa debe seguir corriendo desde cero.
- `intent_configurations`: la unicidad de la intención pasa a ser por alcance.
- `bot_responses`: la referencia a la intención cambia de nombre a identificador. Es el punto de mayor riesgo del cambio.
- `resources`: acotada por alcance.
- Tablas de configuración (`appointment_config`, `agent_config`) preparadas para resolverse por herencia.
- Las filas existentes quedan bajo un nodo raíz sembrado por la propia migración, de modo que producción pueda aceptarla sin intervención manual.

**Código afectado**

- `src/data/repositories/`: `conversation.repository.ts`, `intent-config.repository.ts`, `intent-config.repository.client.ts` y `user.repository.ts` consultan por `intent_name` en seis puntos.
- `src/core/intent-engine/`: la carga de intents pasa a considerar el alcance.
- Cuatro pantallas consultan intenciones por nombre: `intents/page.tsx`, `intents/[intentId]/responses/page.tsx`, `conversations/[userId]/page.tsx` y `IntentForm.tsx`. Es recableado de consultas, no rediseño de interfaz.

**Sin impacto**

- El matcher léxico y su algoritmo de detección.
- El envío a WhatsApp y el formato de las respuestas.
- El compositor de respuestas por bloques.
- El comportamiento del bot mientras exista un solo alcance.
