> **Nota de revisión.** Una primera implementación de la capa de interfaz se descartó tras
> tres rondas de revisión con 23 hallazgos concentrados en tres decisiones estructurales, no
> dispersos. La capa de datos de esa implementación quedó verificada y se conserva; la de
> interfaz se rehace bajo las restricciones de la sección "Estructura de la interfaz".
> Los requisitos de la spec no cambiaron.

## Context

`bot_responses.message_text` es JSONB desde la migración 003 y `response_type` distingue `simple` de `fragmented`. `src/types/message-fragments.types.ts` define siete tipos de fragmento con validadores, y `conversation.repository.ts` ya resuelve los tres formatos de lectura (fragmentado, simple con `media_url`, y simple de solo texto). `message-sender.ts` envía cada tipo.

Lo único que falta es la interfaz. El editor actual en `src/app/(dashboard)/intents/[intentId]/responses/page.tsx` maneja un texto y una sola `media_url` escrita como campo de texto, con un checkbox de "solo media" que oculta el campo de mensaje.

Restricciones relevantes:

- `AGENTS.md` desaconseja introducir dependencias sin evaluar su costo de mantenimiento.
- El constraint `message_text_or_media_required` (migración 019) exige que cada fila tenga texto o media.
- Hay respuestas en producción en los tres formatos; ninguna puede dejar de funcionar.

## Goals / Non-Goals

**Goals:**

- Capturar desde la interfaz todo lo que el motor ya sabe enviar: secuencias de mensajes con media y pausas.
- Adjuntar varios archivos en una sola operación.
- Dejar el formato `fragmented` como el canónico de escritura, sin romper lecturas existentes.
- Corregir los defectos de UX del editor actual señalados en la propuesta.

**Non-Goals:**

- Cambiar el runtime de conversación, el matcher o el envío a WhatsApp.
- Soportar en esta entrega los tipos `location`, `audio` y `contact`. El modelo de datos los admite y se agregan después sin cambiar la arquitectura del editor.
- Migrar en lote las respuestas existentes a formato `fragmented`. La conversión ocurre solo cuando alguien edita y guarda una respuesta.
- Interpolación de variables en respuestas. Es un TODO existente en `conversation.repository.ts` y pertenece a otra capacidad.

## Decisions

### Un bloque de la interfaz equivale a un `MessageFragment`

La lista de bloques del editor se serializa directamente al arreglo `fragments`, sin modelo intermedio. El `delay` de cada fragmento se interpreta como la pausa que precede a ese mensaje, según define el tipo. Esto evita mantener dos representaciones del mismo concepto y hace que la vista previa y el envío real deriven de la misma estructura.

*Alternativa descartada:* un modelo de edición propio con conversión al guardar. Agrega una capa de traducción y una fuente de errores sin beneficio, porque el tipo existente ya expresa lo que el editor necesita.

### Reordenamiento sin dependencia nueva

Arrastre con la API nativa de HTML5 para el ratón, más controles explícitos de mover arriba y abajo que cubren teclado y lectores de pantalla.

*Alternativa descartada:* `@dnd-kit`. Resuelve mejor el arrastre accesible, pero agrega una dependencia y su superficie de mantenimiento para una pantalla de administración de uso interno. Los controles explícitos cubren el requisito de accesibilidad con código propio y sin costo permanente. Si el arrastre nativo resulta insuficiente en la práctica, la decisión se puede revisar sin rehacer el editor.

### `MediaLibrary` gana selección múltiple opcional

Se extiende `MediaLibraryProps` con una bandera de selección múltiple y una devolución de llamada que entrega varias URLs. La firma actual `onSelect: (url: string) => void` se conserva para no tocar a los consumidores existentes.

*Alternativa descartada:* un componente nuevo de selección múltiple. Duplicaría el listado, los filtros por carpeta y la subida de archivos.

### El editor siempre escribe `fragmented`

Al guardar, la respuesta se persiste con `response_type` igual a `fragmented` y `media_url` en `NULL`. El constraint de la migración 019 se satisface porque `message_text` nunca es nulo.

La lectura conserva las tres rutas actuales. Una respuesta legacy solo cambia de formato si alguien la edita y guarda, y el resultado debe ser equivalente en lo que recibe el lead.

*Alternativa descartada:* migrar todas las respuestas en una migración SQL. Convertir texto plano a fragmentos en SQL es frágil, y no hay necesidad: el runtime ya lee ambos formatos indefinidamente.

### Las pausas y el número de bloques se acotan por el presupuesto del webhook

`sendFragmentedMessage` espera cada `delay` de forma secuencial y bloqueante, y el webhook responde `200` solo después de haber enviado todos los mensajes. El tiempo total de una respuesta es entonces la suma de las pausas más una ida y vuelta a la API de Meta por bloque, y ese total retrasa la respuesta del webhook.

Dos consecuencias acotan el diseño:

- Vercel corta la función al alcanzar su duración máxima. `vercel.json` no define `maxDuration`, así que aplica el valor por defecto del plan.
- Meta reintenta las entregas que no reciben `200` a tiempo, y un reintento produce mensajes duplicados para el lead.

De ahí salen los tres límites de la spec: pausas elegidas de un conjunto cerrado con tope de `2000` milisegundos, máximo de seis bloques por respuesta, e indicador visible del tiempo estimado con advertencia al superar diez segundos. Los valores de pausa siguen la convención de facto ya presente en `scripts/test-fragmented-messages.ts`.

El indicador de tiempo es la parte importante: convierte una restricción invisible en información que el administrador entiende mientras compone, en lugar de un error al guardar.

*Alternativa descartada por ahora:* responder `200` de inmediato y enviar en segundo plano. Elimina el techo por completo y es el arreglo de fondo, pero modifica el webhook, que es la pieza más delicada del sistema. Queda como trabajo posterior; el tope de seis bloques mantiene el comportamiento seguro mientras tanto.

### La vista previa es una representación local

Se renderiza en el cliente a partir del estado del editor, sin llamar a WhatsApp ni al backend. Aproxima la presentación de burbujas y el orden de envío; no pretende ser una réplica exacta del cliente de WhatsApp.

### Validación con los validadores existentes

Antes de guardar se ejecuta `validateFragmentedResponse` de `message-fragments.types.ts` sobre la estructura completa, además de la validación por bloque que exige la spec. Así la interfaz no puede escribir un JSONB que el sender no sepa interpretar.

### Estructura de la interfaz

Tres restricciones obligatorias. Cada una elimina una clase completa de defecto observada en
la primera implementación, en lugar de corregir sus síntomas uno por uno.

**El compositor no vive dentro de un `<form>`.** Es una superficie de composición, no un
formulario. Las acciones se disparan con manejadores explícitos y ningún control tiene envío
implícito. En la primera implementación, el modal de biblioteca quedó dentro del formulario y
sus botones, al no declarar tipo, guardaban la respuesta y desmontaban el editor con solo
filtrar por carpeta. Sin formulario, el defecto no se corrige: no puede existir.

**El modal de biblioteca se renderiza en un portal**, fuera del árbol del compositor. Aunque
en el futuro se reintroduzca un formulario, el modal queda fuera de su alcance.

**Nada de estado duplicado.** Toda vista derivable se calcula a partir de una única fuente de
verdad. La primera implementación mantuvo una lista filtrada en paralelo a la lista de
archivos y una referencia en paralelo al estado de bloques, y de ahí salieron el parpadeo de
filtros, la selección invisible y el reordenamiento fantasma tras un arrastre cancelado.

### Un solo criterio de filtrado en la biblioteca

La biblioteca filtra hoy por dos vías que compiten: la carpeta, que es una ruta en el
servidor, y el tipo de archivo, que se evalúa en el cliente. Pedir video estando en la carpeta
de imágenes devuelve vacío y se percibe como un filtro roto.

El filtro por tipo y el de carpeta deben resolverse como un solo criterio coherente: al
solicitar un tipo, la biblioteca muestra los archivos de ese tipo sin que el usuario tenga que
entender que existen carpetas debajo.

### Ubicación del código

Los componentes nuevos viven en `src/components/intents/`, siguiendo la estructura de `AGENTS.md`. La página de respuestas queda como orquestadora: estado, carga y guardado. El acceso a datos permanece en `src/data/repositories/`.

## Risks / Trade-offs

- **Una respuesta legacy cambia de formato al editarse** → El runtime ya soporta ambos formatos, así que el cambio es transparente. La spec exige verificar equivalencia de lo que recibe el lead al convertir sin modificar contenido.

- **Archivos huérfanos en el bucket** al eliminar un bloque cuyo archivo se acababa de subir → No se borra nada del bucket al eliminar bloques. La gestión de archivos sigue siendo responsabilidad de `MediaLibrary`, que ya permite eliminarlos. Borrar desde el editor arriesgaría eliminar un archivo usado por otra respuesta.

- **El arrastre nativo de HTML5 es incómodo en pantallas táctiles** → Los controles de mover arriba y abajo funcionan en cualquier entrada y son la ruta principal garantizada.

- **Secuencias largas con pausas grandes retrasan la conversación** → Se ofrecen pausas sugeridas con un valor por defecto conservador. No se impone un límite duro en esta entrega; si aparece abuso, se acota después con configuración.

- **Regresión en respuestas de producción** → El trabajo se desarrolla y prueba contra el stack local, que ya replica las 24 migraciones desde cero. La verificación incluye leer respuestas en los tres formatos y comprobar que `getBotResponses` devuelve lo mismo que antes del cambio.

## Migration Plan

No requiere migración de esquema: `message_text` ya es JSONB y `response_type` ya existe.

**Despliegue:** el cambio es solo de interfaz y de escritura. Al publicarse, las respuestas existentes siguen sirviéndose igual y las nuevas se guardan en formato fragmentado.

**Rollback:** revertir el código. Las respuestas guardadas como `fragmented` durante la ventana siguen siendo válidas, porque el runtime anterior a este cambio ya sabe leer ese formato. No hay estado que deshacer.

## Open Questions

Ninguna pendiente para implementar.

Resueltas durante el diseño:

- **Valores de pausa:** `0`, `800`, `1200` y `2000` milisegundos, con `1200` por defecto, siguiendo la convención ya usada en el proyecto y acotados por el presupuesto del webhook.
- **Límite de bloques:** seis por respuesta, derivado del mismo presupuesto y acompañado del indicador de tiempo estimado.

Diferido a trabajo posterior, fuera del alcance de este cambio:

- Responder el webhook de inmediato y enviar los fragmentos en segundo plano, para eliminar el techo de tiempo.
