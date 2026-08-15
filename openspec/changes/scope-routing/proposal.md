## Why

El árbol de alcances ya permite que cada desarrollo tenga su propio contenido, pero nada determina de cuál se está hablando: toda conversación se resuelve contra el alcance raíz. Sin eso, un segundo desarrollo existe en la base y es inalcanzable desde WhatsApp.

Hay una señal que hoy se descarta y que resuelve el problema para la mayoría del tráfico sin inferir nada. Meta incluye un objeto `referral` en el primer mensaje originado por un anuncio de clic a WhatsApp, con el identificador del anuncio. El webhook no lo lee: `extractMessage` solo extrae remitente, identificador de mensaje, texto y nombre.

Eso importa porque **las frases prefabricadas de los anuncios son idénticas entre campañas**. El texto no distingue de qué desarrollo viene el lead; el identificador del anuncio sí, y con certeza. Mapear anuncio a alcance da ruteo determinista, sin modelo de lenguaje y sin margen de error, además de atribución por campaña.

## What Changes

- El webhook captura el `referral` de los mensajes originados en anuncios y conserva el identificador del anuncio junto al mensaje.
- Nueva relación entre anuncios y alcances: un anuncio determina el alcance de la conversación que origina.
- La sesión gana un foco: el alcance sobre el que se está hablando, que persiste entre mensajes y puede cambiar durante la conversación.
- La detección de intención y la resolución de respuestas usan ese foco en lugar de asumir la raíz.
- Los alias de un alcance permiten cambiar el foco cuando el lead nombra un desarrollo, sin importar a qué profundidad esté en el árbol.
- El saludo se compone con los alcances activos disponibles, en lugar de enumerarlos en un texto fijo que hay que editar a mano en cada alta.
- Las conversaciones registran el alcance de cada mensaje, para poder leer el historial y medir por desarrollo.

**Fuera de alcance de este cambio:**

- Checkpoints, lead score y citas por alcance. Corresponde a `scope-progress`.
- Interfaz de administración de alcances, alias y anuncios. Se siembran por SQL; la gestión visual llega después.
- Resolver con un modelo de lenguaje los mensajes que el matcher no logra atribuir a un alcance. Se decide con datos de uso una vez que el ruteo determinista esté midiendo.

Con un solo alcance activo, el comportamiento observable del bot es idéntico al actual.

## Capabilities

### New Capabilities

- `scope-routing`: determinación y seguimiento del alcance de una conversación, a partir del anuncio de origen, de lo que el lead nombra, y del foco previo.

### Modified Capabilities

- `scope-resolution`: la resolución deja de partir siempre del alcance raíz y pasa a partir del foco de la conversación.

## Impact

**Base de datos**

- Migraciones nuevas a partir de la 028, aditivas.
- Relación entre identificadores de anuncio y alcances.
- Alias por alcance, para reconocer cómo nombra el lead cada desarrollo.
- Foco de la conversación y foco previo en `user_sessions`.
- Alcance del mensaje en `conversations`.

**Código afectado**

- `src/services/whatsapp/webhook-validator.ts`: `extractMessage` descarta hoy el `referral`.
- `src/app/api/webhook/whatsapp/route.ts`: propagar el origen del mensaje.
- `src/core/conversation/message-processor.ts`: resolver el foco antes de detectar intención y persistirlo.
- `src/core/intent-engine/`: reconocimiento de alias de alcance.
- `src/data/repositories/`: sesión, conversaciones y el nuevo acceso a anuncios y alias.
- `src/data/repositories/conversation.repository.ts`: la interpolación de variables en respuestas es hoy un `TODO` sin implementar, y el saludo la necesita.

**Sin impacto**

- El algoritmo del matcher.
- El envío a WhatsApp y el formato de las respuestas.
- El compositor de respuestas por bloques.
- El comportamiento del bot mientras exista un solo alcance activo.
