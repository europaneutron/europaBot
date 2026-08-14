## Why

El motor del bot ya sabe enviar respuestas compuestas por varios mensajes: `bot_responses.message_text` es JSONB, `src/types/message-fragments.types.ts` define siete tipos de fragmento con un `delay` en milisegundos para dar pacing natural, y `message-sender.ts` los envía. La interfaz no sabe capturarlos: el editor actual solo permite un texto y una sola URL de media.

El resultado es una capacidad construida y pagada que nadie puede usar sin escribir JSON a mano. Adjuntar tres fotos de una casa y su ficha en PDF —el caso más común del negocio— hoy es imposible desde el dashboard.

## What Changes

- Nuevo editor de respuestas basado en bloques: cada respuesta es una secuencia ordenada de fragmentos en lugar de un texto plano con media opcional.
- Agregar, eliminar y reordenar bloques de tipo `text`, `image`, `document` y `video`.
- Adjuntar varios archivos de una sola vez, reutilizando `MediaLibrary` y el bucket `bot-media`.
- Configurar el `delay` entre bloques con valores sugeridos, en lugar de escribirlo a mano.
- Vista previa que muestra la secuencia como la recibirá el lead en WhatsApp, respetando el orden y las pausas.
- Convergencia de la columna legacy `media_url` hacia `fragments`: el editor escribe siempre formato `fragmented`; el runtime sigue leyendo respuestas `simple` y `media_url` existentes sin cambios.
- Correcciones de UX del editor actual: el modo "solo media" deja de ser un checkbox que oculta campos, la URL de media deja de ser un campo de texto editable a mano, y se valida el contenido por bloque en lugar de con una regla global.

No hay cambios en el runtime de conversación: el matcher, el orquestador de mensajes y el sender quedan intactos.

## Capabilities

### New Capabilities

- `response-composer`: composición y edición de respuestas del bot como secuencias ordenadas de fragmentos multimedia, incluyendo adjuntos múltiples, control de pausas, vista previa y persistencia retrocompatible.

### Modified Capabilities

Ninguna. No existen specs previas en `openspec/specs/`.

## Impact

**Código afectado**

- `src/app/(dashboard)/intents/[intentId]/responses/page.tsx` — se reemplaza el formulario actual por el editor de bloques.
- `src/components/admin/MediaLibrary.tsx` — se reutiliza; puede requerir soporte de selección múltiple.
- `src/data/repositories/conversation.repository.ts` y `intent-config.repository.ts` — lectura y escritura de respuestas en formato `fragmented`.
- `src/types/message-fragments.types.ts` — se reutiliza tal cual; ya cubre los tipos y la validación.
- Componentes nuevos bajo `src/components/intents/`.

**Base de datos**

- Sin migración de esquema obligatoria. `message_text` ya es JSONB y `response_type` ya distingue `simple` de `fragmented`.
- La columna `media_url` se conserva por retrocompatibilidad. El constraint `message_text_or_media_required` (migración 019) debe seguir satisfecho por las respuestas nuevas.

**Sin impacto**

- Runtime de conversación, matcher, envío a WhatsApp, y las respuestas ya existentes en producción, que se siguen leyendo en su formato actual.
