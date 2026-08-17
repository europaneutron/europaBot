## Why

El compilador produce contenido que no se puede diferenciar por producto y que no sustituye a lo que reemplaza. Las dos cosas están rotas hoy en la base local, y una de ellas sale al lead.

**Todo se cuelga de la raíz.** En `generateContent`, las intenciones se toman con `getVisibleIntents(run.scope_id)`, que resuelve hacia arriba y devuelve las de la raíz; la propuesta se crea con el id de esa intención raíz. Consecuencia: por muy bien que el compilador atribuya un hecho a "Modelo Solara", la respuesta nunca se escribe ahí. Compilar Europa y Altabrisa escribe sobre la misma intención.

**Lo que no encaja se tira en silencio.** `if (!intent || !proposal) return []` descarta cualquier pregunta que el material sustente pero que no esté entre las nueve intenciones sembradas. Amenidades, horario y disponibilidad desaparecen sin dejar rastro ni aviso.

**Y lo anterior se queda.** Aprobar contenido nuevo no retira lo que sustituye. Hoy `precio` en la raíz tiene tres respuestas activas y el runtime las manda **todas seguidas**: la compilada con el dato real y, a continuación, la sembrada que habla de un desarrollo que ya no existe en esa cuenta. En `ubicacion` pasa lo mismo, con la dirección real seguida de `[DIRECCIÓN EXACTA]`.

La simulación de `openspec/conversacion-objetivo.md` demuestra que el runtime ya sabe resolver contenido por alcance y heredarlo: sembrando a mano intenciones propias por alcance, siete de diez turnos pasan. Lo que falta no es el motor, es quien llene el contenido en el nivel correcto.

## What Changes

- El contenido compilado se escribe en el alcance donde vive el dato. Un hecho atribuido a un modelo produce contenido en ese modelo, no en el desarrollo.
- El compilador crea la intención que falta en lugar de descartar la propuesta. Una pregunta que el material sustenta deja de depender de que alguien la hubiera sembrado antes.
- **BREAKING para el contenido existente:** una sola respuesta activa por pregunta y alcance. Aprobar la nueva retira la anterior, con registro de cuál era. Deja de haber dos versiones saliendo juntas.
- Los seguimientos dejan de ser respuestas que compiten por la misma pregunta y pasan a ser fragmentos de una sola respuesta, que es para lo que existe el modelo de fragmentos.
- Nada se descarta en silencio: lo que el compilador no pueda colocar aparece como hueco visible en la revisión.

## Capabilities

### New Capabilities
- `scoped-content`: dónde se escribe cada respuesta compilada, qué intención se crea, y qué pasa con la respuesta que había antes en ese mismo lugar.

### Modified Capabilities

Ninguna spec archivada cambia sus requisitos. `response-composer` se toca solo en implementación, al convertir seguimientos en fragmentos.

## Impact

- **Código:** `document-compiler.service.ts` (`generateContent`, `buildCatalog`), `document-compiler.repository.ts` (`getVisibleIntents`, `replaceProposals`, `approveProposal`), y la resolución de respuestas en `conversation.repository.ts`.
- **Datos:** contenido sembrado que hoy convive con contenido compilado. Hay que decidir explícitamente qué se retira y dejar registro; no puede resolverse borrando.
- **Riesgo principal:** este cambio **desactiva contenido que hoy sale a leads**. Retirar de más deja al bot sin respuesta; retirar de menos deja el defecto actual. Ninguna migración debe reescribir el texto de un cliente sin que lo vea, que es la regla que este proyecto se puso al retirar los CTA sembrados.
- **Verificación:** los turnos de `openspec/conversacion-objetivo.md`. Hoy pasan siete de diez con contenido sembrado a mano; al terminar deben pasar los mismos con contenido producido por el compilador.
- **Depende de:** `simulador-conversacion`, para poder verificarlo en el navegador sin terminal.
