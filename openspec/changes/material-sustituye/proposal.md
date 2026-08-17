## Why

Subir material nuevo tenia que dejar el bot diciendo lo que dice el material, y hoy lo deja diciendo las dos cosas. El contenido anterior sobrevive a la corrida, se mezcla con lo compilado en la pantalla de aprobacion, y el lead recibe respuestas de las dos epocas segun donde tenga el foco.

La causa es que cada corrida acuna estructura nueva en vez de sustituir la que hay. En la base local, compilar el material de FYMSA dejo dos desarrollos llamados Europa: `Europa` con el contenido anterior y `Residencial Europa` con cero intenciones. El saludo ofrece el mismo desarrollo dos veces y "me interesa Europa" cae al fallback porque el alias es ambiguo. Ninguna limpieza posterior aguanta mientras cada corrida sume otra rama.

Alrededor de ese defecto se construyo maquinaria para convivir con la mezcla —panel de colisiones, confirmacion por respuesta, historial de sustituciones— que deja de hacer falta en cuanto la regla es simple: **al aprobar, el bot pasa a ser el material**.

## What Changes

- **BREAKING** Aprobar una corrida sustituye el bot: se retira el contenido anterior y los alcances que el material no menciona, y queda solo lo compilado. Deja de existir la convivencia entre contenido viejo y nuevo.
- Una corrida acepta **varios materiales a la vez**. El cliente sube el material de su negocio completo y el compilador determina cuantos desarrollos hay dentro. `compiler_runs.material_ids` ya es un arreglo; hoy la interfaz toma un archivo y el repositorio siempre escribe uno.
- Interruptor **"Anadir"**, opcional y explicito: incorpora lo que traiga el material sin retirar lo que ya existe. Es el caso raro —un desarrollo nuevo en un negocio ya configurado— y por eso no es el comportamiento por omision.
- La pantalla de aprobacion muestra **solo lo nuevo**. Se retira el panel de colisiones y las candidatas a sustituir que se enseñaban junto a cada propuesta. Bajo la regla nueva no hay nada que comparar.
- **BREAKING** Se retira `resolve_response_collision` y el endpoint que la expone.
- Las columnas `edited_by_human`, `superseded_by_response_id` y `deactivated_at` se conservan: sirven al editor de respuestas para seguimiento. Solo salen de la pantalla de aprobacion. No se construye interfaz nueva alrededor de ellas.
- La sustitucion es **una transaccion**: o el bot queda entero como el material, o queda como estaba. No hay estado intermedio en el que el lead converse con medio catalogo.

## Capabilities

### New Capabilities
- `material-replacement`: que significa aprobar una corrida —el alcance de la sustitucion, que se retira y que sobrevive, el modo anadir, y la atomicidad de todo ello.

### Modified Capabilities
- `document-compiler`: una corrida se abre con varios materiales en vez de uno, y su etapa de estructura propone el negocio completo en vez de una rama.
- `scoped-content`: se retira la resolucion de colisiones y la confirmacion por respuesta al aprobar; la pantalla de revision deja de mostrar contenido anterior.

## Impact

- Base de datos: funcion nueva de sustitucion atomica; se retira `resolve_response_collision` (migraciones 042 y 043 completas, y su bloque en la 041). Las columnas de seguimiento se quedan. Migracion aditiva, aplicable en produccion sin ventana.
- `src/core/document-compiler/document-compiler.service.ts`: alta de corrida con varios materiales; la etapa de estructura cubre el negocio.
- `src/data/repositories/document-compiler.repository.ts`: `createRun` con varios materiales; se retira `listResponseCollisions` y `resolveResponseCollision`.
- `src/app/(dashboard)/compiler/page.tsx`: fuera el panel de colisiones y las candidatas; la aprobacion queda como unica pantalla.
- `src/app/api/compiler/collisions/route.ts`: se elimina.
- `src/app/(dashboard)/onboarding/page.tsx`: subida de varios archivos y el interruptor de modo.
- Pruebas: `scripts/test-scoped-content.ts` pierde los casos de colision y confirmacion y gana los de sustitucion; `scripts/test-document-compiler-e2e.ts` compila los dos materiales de FYMSA en una corrida.
