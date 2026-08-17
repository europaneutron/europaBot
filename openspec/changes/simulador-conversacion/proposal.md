## Why

Todo lo que se ha escapado en las últimas tres specs se encontró **usando** la aplicación, no leyéndola: la barra que se atascaba, el campo que no seguía a una propuesta nueva, las amenidades ofrecidas como casas en venta, el panel mostrando datos de una prueba. Las tareas de verificación manual existen en las specs y llevan dos entregas sin marcarse, porque hoy la única forma de ver qué contesta el bot es que alguien corra un script en terminal.

Leonardo no puede hacer eso. Depende de que yo ejecute la simulación y le cuente el resultado, y esa dependencia es la razón de fondo por la que la verificación se salta.

El motor para resolverlo ya está: `POST /api/test/process-message` ejecuta el procesador completo y devuelve la respuesta sin enviarla por WhatsApp, y `POST /api/test/reset-user` limpia el estado de un lead. Falta la pantalla.

## What Changes

- Pantalla de conversación en el dashboard que habla con el procesador real: mismo ruteo, mismo matcher, mismo flujo de cita, misma persistencia. No es una maqueta ni un mock.
- Cada turno muestra, junto a la respuesta, **por qué** el bot contestó eso: alcance en foco, intención detectada, si fue fallback y si quedó una pregunta pendiente. Es el mismo diagnóstico que hoy solo se ve por consola.
- Reinicio del lead simulado en un clic, para repetir una conversación desde cero sin tocar la base a mano.
- Elección del lead simulado y, opcionalmente, del anuncio de procedencia, para poder reproducir la entrada por Click-to-WhatsApp.
- Bloqueada en producción, igual que los endpoints que usa.

No cambia ningún comportamiento del bot. Es una ventana sobre lo que ya hace.

## Capabilities

### New Capabilities
- `conversation-simulator`: probar el bot conversando con él desde el dashboard, con el estado de ruteo visible en cada turno y sin enviar mensajes reales.

### Modified Capabilities

Ninguna. El procesador, el ruteo y el contenido no cambian.

## Impact

- **Nuevo:** una pantalla del dashboard y, si hace falta, una ruta que envuelva los endpoints de prueba existentes con la autenticación del panel.
- **Se reutiliza sin tocar:** `POST /api/test/process-message`, `POST /api/test/reset-user`, `messageProcessor`, `scopeRoutingService`.
- **Riesgo principal:** que la pantalla escriba en la misma base que se usa para revisar contenido. El lead simulado tiene que ser distinguible y desechable, para que una prueba no aparezca luego como un lead real en el panel ni sume al lead score de nadie.
- **Depende de:** nada. Es la primera de las specs pendientes precisamente por eso.
- **Habilita:** la verificación de las cuatro specs siguientes, cuyos criterios de aceptación son los turnos de `openspec/conversacion-objetivo.md`.
