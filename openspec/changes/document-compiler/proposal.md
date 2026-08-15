## Why

Los cuatro cambios anteriores construyeron el runtime: el árbol, el ruteo, el progreso y el editor. Todos parten del mismo supuesto —que alguien ya escribió el contenido— y ese supuesto es el cuello de botella real del producto.

Dar de alta un desarrollo hoy significa que una persona invente el catálogo de preguntas, escriba una respuesta para cada una, y transcriba a mano precios y ubicaciones desde el brochure del cliente. Con dos desarrollos son dos catálogos. Con una inmobiliaria de cinco proyectos, es un trabajo que nadie va a hacer bien, y del que nadie va a poder decir después de dónde salió cada cifra.

El material ya existe: el cliente llega con un brochure. La información está ahí, ordenada, y hoy se copia a mano.

Hay además un problema que la transcripción manual no resuelve: **nadie puede decir qué falta**. Si el brochure no menciona financiamiento, el bot simplemente no responde eso, y solo se descubre cuando un lead pregunta y se escala a un asesor. Un compilador que lee el documento sí puede decirlo antes de que ocurra.

## What Changes

- El cliente sube su material —texto, documento o PDF— y el sistema lo compila en el contenido de un alcance.
- La compilación ocurre **fuera del camino del mensaje**. El runtime sigue siendo el matcher, sin llamadas a modelos de lenguaje ni latencia añadida.
- Primero se extraen hechos con su procedencia —de qué documento, de qué parte— y todo lo que el bot diga queda trazable a uno de ellos.
- El sistema reporta **qué preguntas quedaron sin respuesta** en el material entregado, en lugar de rellenarlas.
- Nada llega a un lead sin que un humano lo apruebe. La aprobación ocurre en dos momentos: primero la forma del árbol, después el contenido.
- Volver a subir material solo regenera lo que depende de un hecho que cambió; el resto, incluidas las ediciones a mano, se queda como está.
- Las preguntas que el bot no supo responder se acumulan como la lista de lo que falta compilar, en vez de perderse en el escalamiento.

**Fuera de alcance de este cambio:**

- Que un modelo de lenguaje intervenga al responder un mensaje. El runtime no cambia.
- El chat guiado que recoge la marca y el vocabulario del cliente. Corresponde a `onboarding-chat`.
- Cambiar el catálogo de intenciones del runtime o cómo se detectan. El compilador produce contenido para el mecanismo que ya existe.
- Objetivos de conversión distintos de la cita.

Mientras nadie compile nada, el comportamiento observable del bot es idéntico al actual.

## Capabilities

### New Capabilities

- `document-compiler`: ingesta del material de un cliente, extracción de hechos con procedencia, reporte de cobertura, y generación de contenido propuesto para un alcance, sujeto a aprobación humana.

### Modified Capabilities

- `response-composer`: las respuestas ganan un origen —propuesta por el compilador o escrita a mano— y la procedencia del hecho del que salieron.

## Impact

**Base de datos**

- Migraciones nuevas a partir de la 033, aditivas.
- Material entregado por el cliente y su texto extraído.
- Hechos con su procedencia y el alcance al que pertenecen.
- Relación entre una respuesta y los hechos de los que depende.
- Estado de aprobación de lo propuesto.
- Huecos de cobertura detectados.

**Código afectado**

- `src/app/api/intents/generate-patterns/route.ts`: ya resuelve la llave desde Vault, el modelo desde `bot_config` y la autenticación de administrador. El compilador reutiliza ese camino en lugar de abrir otro.
- `src/data/repositories/`: acceso al material, a los hechos y a las propuestas.
- `src/components/intents/`: el editor de bloques es donde se revisa lo propuesto; gana la procedencia visible.
- `src/core/fallback/` e `intents_log`: hoy solo escalan; pasan a alimentar la lista de lo que falta.

**Sin impacto**

- El algoritmo del matcher y la detección de intención.
- El ruteo por alcance y el progreso del lead.
- El envío a WhatsApp.
- El comportamiento del bot sobre contenido ya aprobado.
