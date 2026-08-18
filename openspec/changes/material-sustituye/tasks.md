## 1. Base de datos

- [x] 1.1 Migracion aditiva: `compiler_runs.replacement_mode` TEXT NOT NULL DEFAULT 'replace' con CHECK en ('replace','add'), y `bot_responses.inactive_reason` admite 'material_replacement'
- [x] 1.2 Funcion `publish_compiler_run(run_uuid, admin_uuid)` que aplica la corrida entera en una transaccion: publica cada propuesta pendiente, enciende sus intenciones, escribe alias, y en modo `replace` retira contenido y alcances anteriores
- [x] 1.3 En `publish_compiler_run`, el retiro marca `is_active=false`, `deactivated_at`, `deactivated_by` e `inactive_reason='material_replacement'`; nunca borra filas
- [x] 1.4 En `publish_compiler_run`, el alcance raiz nunca se retira, y en modo `add` no se retira nada
- [x] 1.5 Retirar `resolve_response_collision` (todas sus versiones de las migraciones 041, 042 y 043)
- [x] 1.6 Retirar `approve_compiler_proposal`, sustituida por la publicacion de la corrida completa

## 2. Varios materiales por corrida

- [x] 2.1 `documentCompilerRepository.createRun` acepta varios `materialIds` y los escribe en `material_ids`
- [x] 2.2 La ruta de subida acepta varios archivos en una peticion y los asocia a la misma corrida
- [x] 2.3 Cuando uno de varios materiales no se puede leer, la corrida lo reporta nombrandolo, sin continuar como si no existiera
- [x] 2.4 La pantalla de onboarding permite seleccionar varios archivos y los muestra en lista antes de compilar

## 3. La estructura describe el negocio

- [x] 3.1 La etapa de estructura propone todos los desarrollos que el material describe, no una rama
- [x] 3.2 Un desarrollo nombrado de varias formas se propone una sola vez, con las demas formas como alias
- [x] 3.3 Al publicar, los alias se escriben en `scope_aliases`
- [x] 3.4 Verificar con los dos materiales de FYMSA en una corrida: la estructura contiene Europa y Altabrisa con sus modelos, y ningun desarrollo duplicado

## 4. Publicar la corrida

- [x] 4.1 `documentCompilerRepository.publishRun` llama a la funcion nueva
- [x] 4.2 Endpoint de publicacion de la corrida, con la comprobacion de administrador activo
- [x] 4.3 Revisar una propuesta pasa a ser editar su texto o rechazarla; deja de publicar nada por su cuenta
- [x] 4.4 Al publicar, se invalida la deteccion de intenciones y la version del arbol sube una sola vez

## 5. Modo de la corrida

- [x] 5.1 El modo se elige al abrir la corrida y por omision es sustituir
- [x] 5.2 La pantalla de aprobacion dice cual de las dos cosas va a pasar
- [x] 5.3 Antes de publicar en modo sustituir, se nombran los desarrollos que dejan de ofrecerse y cuantas respuestas se retiran, de ellas cuantas con `edited_by_human`

## 6. La pantalla muestra solo lo nuevo

- [x] 6.1 Retirar el panel de colisiones de `src/app/(dashboard)/compiler/page.tsx`
- [x] 6.2 Retirar las candidatas a sustituir que se mostraban junto a cada propuesta, y la confirmacion por respuesta
- [x] 6.3 Retirar `listResponseCollisions` y `resolveResponseCollision` del repositorio, y `replacement_candidates` de `getReview`
- [x] 6.4 Eliminar `src/app/api/compiler/collisions/route.ts`
- [x] 6.5 Un solo boton publica la corrida; las propuestas conservan editar y rechazar

## 7. El foco no apunta a lo retirado

- [x] 7.1 Al resolver el foco, un alcance que no es alcanzable se suelta y la conversacion se resuelve desde el negocio
- [x] 7.2 Verificar que un lead con cita agendada en un alcance retirado no produce error al escribir

## 8. Pruebas

- [x] 8.1 `scripts/test-scoped-content.ts`: retirar los casos de colision y de confirmacion por respuesta
- [x] 8.2 Prueba de que publicar retira todo el contenido anterior del ambito y deja solo lo compilado
- [x] 8.3 Prueba de que un fallo a media publicacion deja el bot exactamente como estaba, y que reintentar funciona
- [x] 8.4 Prueba de que en modo anadir no se retira nada
- [x] 8.5 Prueba de que leads, conversaciones, citas, progreso y configuracion sobreviven a una sustitucion
- [x] 8.6 Prueba de que un lead con el foco en un alcance retirado recibe respuesta desde el negocio
- [x] 8.7 `scripts/test-document-compiler-e2e.ts`: compilar los dos materiales de FYMSA en una sola corrida y publicar
- [x] 8.8 Ninguna prueba deja datos temporales, y las que tocan configuracion global la restauran en el `finally`

## 9. Recorrido de aceptacion

> Bloqueado por la spec del vocabulario. El recorrido se hizo el 17 de agosto de
> 2026 con `scripts/walkthrough-fymsa.ts`: la estructura y la publicacion salen
> bien, pero el bot compilado cae al fallback en casi todo porque el vocabulario
> se genera con una palabra por intencion y sin sinonimos. No se marcan como
> hechas hasta que eso se corrija.

- [ ] 9.1 Con la base sembrada y sucia, subir `fymsa-europa.txt` y `fymsa-altabrisa.txt` juntos, revisar y publicar
- [ ] 9.2 Comprobar en el simulador que no queda rastro del contenido anterior: ningun `[XXX]`, ninguna mencion a Europa desde el negocio, ningun desarrollo duplicado
- [ ] 9.3 Comprobar que "me interesa Europa" fija el foco y que "que casas manejan" no cae al fallback, con el vocabulario salido del material
- [ ] 9.4 Recorrer los turnos de `openspec/conversacion-objetivo.md` sobre el contenido publicado
