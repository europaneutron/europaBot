## Context

`scope-tree` dio el árbol y `scope-routing` decide de qué rama se está hablando. Este cambio es el que hace que esa decisión tenga consecuencias medibles.

Estado actual del progreso, verificado en el esquema y en el código:

- `user_checkpoints` quedó normalizado en la migración 022, con `UNIQUE(user_id, intent_name)`. Ese constraint es el candado que hay que abrir.
- `users.lead_score` y `users.lead_status` son columnas de la fila de la persona, desde la migración 001.
- `users.appointment_offered` es un booleano que se marca una vez y no se vuelve a mirar.
- El umbral que dispara la oferta es `checkpoints_for_appointment`, leído en `message-processor.ts`; el ofrecimiento se marca como `pending_auto_offer` y se manda en un mensaje aparte.

Diecisiete archivos leen `lead_score` o `lead_status`, casi todos del dashboard. Ese es el peso real del cambio: no crear las tablas nuevas, sino mover un dato que media docena de pantallas dan por sentado.

### Mapa del progreso antes y después del cambio

| Qué | Cómo se lleva hoy | Cómo se llevará |
|---|---|---|
| Checkpoint | `(usuario, intención)`, único | `(usuario, alcance, intención)` |
| Umbral de cita | Conteo de checkpoints de la persona | Conteo dentro de la rama del foco |
| Score y estado | Columnas de `users` | Por persona y alcance; la columna de `users` pasa a ser el agregado |
| Ofrecimiento de cita | Booleano único en la vida del lead | Por alcance |
| Cita | Sin alcance | Con el alcance del que nació |
| Frecuencia de iniciativa | Por usuario, ya lo es | Sigue siendo por usuario, deliberadamente |
| Lectura del dashboard | `users.lead_score` | `users.lead_score`, con el mismo significado |

### Inventario de lecturas y escrituras

El inventario previo a la implementación encontró dieciocho archivos en `src/` (el conteo
de diecisiete que motivó la propuesta no incluía `types/advisor.types.ts`). La decisión por
archivo es:

| Archivo | Uso actual | Decisión |
|---|---|---|
| `data/repositories/user.repository.ts` | Escribe `users.lead_score/status`, checkpoints y `user_progress.appointment_offered` | Cambia: será el único acceso al detalle por alcance y mantendrá el agregado de `users` |
| `core/scoring/lead-scorer.ts` | Calcula globalmente y escribe `users` | Cambia: calcula el alcance, delega persistencia y agregación al repositorio |
| `core/conversation/message-processor.ts` | Registra/count checkpoints y decide la oferta global | Cambia: atribuye al foco y evalúa la rama; la frecuencia sigue siendo por persona |
| `app/api/test/reset-user/route.ts` | Reinicia el booleano global | Cambia: usa el repositorio para reiniciar también el detalle por alcance |
| `core/fallback/fallback-handler.ts` | Lee score/status y conteo para derivación | Conserva la lectura agregada; el conteo mostrado sigue siendo por persona |
| `data/repositories/advisor.repository.ts` | Copia score agregado al crear/listar solicitudes | Sin cambio: conserva la fotografía agregada del lead |
| `hooks/use-advisor-requests.ts` | Lee score/status agregados | Sin cambio |
| `hooks/use-analytics.ts` | Filtra y agrega score/status de `users` | Sin cambio |
| `hooks/use-conversations.ts` | Lee score/status y checkpoints para el detalle | Score/status siguen agregados; la lista de checkpoints se deduplica para conservar la UI actual |
| `app/(dashboard)/advisor-requests/page.tsx` | Muestra score/status agregados | Sin cambio |
| `app/(dashboard)/appointments/page.tsx` | Lee score agregado del usuario | Sin cambio |
| `app/(dashboard)/appointments/appointments-client.tsx` | Muestra score agregado | Sin cambio |
| `app/(dashboard)/conversations/[userId]/page.tsx` | Muestra score/status y checkpoints | Sin cambio |
| `app/(dashboard)/conversations/page.tsx` | Filtra y muestra score/status | Sin cambio |
| `app/(dashboard)/conversations/page-old.tsx` | Vista antigua del mismo agregado | Sin cambio |
| `app/(dashboard)/dashboard/page.tsx` | Muestra status agregado | Sin cambio |
| `data/models/user.model.ts` | Modela los campos agregados y el booleano legado | Cambia solo el modelo del detalle; `User` conserva score/status |
| `types/advisor.types.ts` | Modela la fotografía agregada de la solicitud | Sin cambio |

Hay otros caminos relacionados que no coincidían con los cuatro nombres buscados:
`appointment-manager.ts` y `appointment.repository.ts` cambian para conservar el alcance de
origen; los repositorios y el formulario de intenciones cambian para exponer la señal fuerte.
Los procesadores de follow-up ya limitan y cancelan por `user_id`, por lo que conservan su
comportamiento y no ganan una dimensión de alcance.

### Línea base de un solo alcance

La línea base se registró el 2026-08-15 contra el stack local, antes de modificar código o
esquema, y quedó serializada en `baseline.json`. Solo estaba activa la raíz `Europa`. La
configuración observada mantiene 15 puntos por checkpoint y el umbral de oferta en cuatro;
las clasificaciones son `cold` hasta 39, `warm` hasta 69 y `hot` desde 70.

Los cuatro leads existentes confirman la regla vigente: 0 checkpoints produce 0/cold, uno
produce 15/cold, tres más una cita activa producen 65/warm, y seis producen 90/hot. Las
vistas consultan directamente `users.lead_score` y `users.lead_status`, de modo que esa es
la interfaz de compatibilidad que debe permanecer estable.

### Regla única de agregación

El score de cada alcance se calcula con actividad de ese alcance y sus descendientes. El
score agregado de la persona es el **máximo** de sus scores de rama, no la suma ni el
promedio. Así el dashboard representa el desarrollo de mayor intención comercial sin
mezclar ramas ni rebajar un interés fuerte porque la persona también comparó otra opción.
El estado agregado se deriva una sola vez de ese máximo. La escritura del detalle y el
recálculo de `users` forman una única operación de repositorio; ningún consumidor calcula
su propia variante.

## Goals / Non-Goals

**Goals:**

- Que el interés en un desarrollo no contamine la cuenta de otro.
- Que el ofrecimiento de cita nazca del desarrollo en el que la persona profundizó.
- Que el equipo de ventas siga viendo una cifra por lead, sin perder el detalle por desarrollo.
- Que quien ya recibió una oferta para un desarrollo pueda recibir otra para el siguiente.
- Que con un solo alcance nada cambie, ni en el bot ni en las pantallas.

**Non-Goals:**

- Calificar interés con un modelo de lenguaje.
- Rediseñar el flujo de agendamiento.
- Relacionar una cita con varios alcances.
- Interfaz de administración del progreso por alcance.

## Decisions

### El checkpoint es el par intención y alcance

`precio` en un desarrollo y `precio` en otro son dos hechos distintos sobre la misma persona. Hoy el segundo no se registra porque el constraint lo confunde con el primero, y el sistema concluye que ya se cubrió ese tema.

Es una columna en la clave de unicidad. Que sea barato no lo hace menor: es la pieza de la que dependen el umbral, el score y la oferta.

### El umbral se cuenta dentro de la rama

Tres checkpoints en un desarrollo significan que a esa persona le interesa ese desarrollo. Tres checkpoints repartidos entre dos significan que está comparando, que es un momento anterior de la decisión.

Contarlos juntos produce un disparo falso justo en el punto donde el sistema tiene una sola oportunidad. Se cuentan dentro de la rama del foco, con la misma noción de rama que usa `scope-routing`: el descendiente cuenta para su desarrollo.

*Alternativa descartada:* umbral global con un factor de corrección. Ajusta el síntoma sin arreglar la causa, y deja un número que nadie sabe justificar.

### El score por alcance es la verdad; el del usuario es un agregado

Alguien puede estar listo para comprar un terreno y apenas curioseando casas. Una sola cifra no puede decir eso, y hoy dice el promedio de las dos, que no describe a nadie.

El detalle vive por alcance. La columna de la persona no desaparece: se recalcula desde el detalle, para que las pantallas que ya existen sigan funcionando sin reescribirse. Es lo que hace que este cambio sea abordable — diecisiete archivos leen esa columna.

La regla de agregación tiene que ser explícita y estar en un solo lugar. Dos formas distintas de agregar el mismo dato es exactamente la trampa que costó tres rondas en `scope-tree` con la configuración del asesor.

### El contenido va por alcance; la frecuencia va por persona

Es la decisión que evita convertir la mejora en spam. Si cada alcance lleva su propio seguimiento y su propia oferta, alguien interesado en tres cosas recibe tres secuencias, y el número de WhatsApp se quema.

Lo que se personaliza por alcance es *qué* se dice. Cuántas veces el bot toma la iniciativa, y el enfriamiento tras un rechazo, se cuentan por persona.

### Un solo componente pide la cita

El ofrecimiento pertenece al runtime, no al contenido. Lo dispara el umbral, y manda un mensaje aparte.

Las respuestas no llevan invitación propia a agendar. Si cada respuesta invita, el umbral se vuelve decorativo y el bot pregunta lo mismo cuatro veces seguidas. Importa dejarlo escrito aquí porque el compilador de documentos va a redactar respuestas, y esa es justo la clase de cierre que un texto comercial trae de fábrica.

### La calificación es determinista

Contar checkpoints es auditable, gratis e inmediato. Un modelo de lenguaje en ese punto agrega latencia y varianza para producir un número que el conteo ya da.

Su limitación conocida es real y conviene nombrarla: el umbral mide **amplitud, no intensidad**. No detecta a quien escribe "quiero comprar ya, tengo el crédito aprobado" en el segundo mensaje, porque esa persona no ha cubierto tres temas.

El arreglo no es un clasificador: es una intención más, marcada como señal fuerte, que dispara el ofrecimiento sin esperar al umbral. Sigue siendo el matcher, y sigue siendo configurable desde el dashboard.

## Risks / Trade-offs

- **La migración del progreso existente** → Los checkpoints y scores actuales pertenecen a la única rama que existía. Atribuirlos mal deja a los leads vivos con un historial que no corresponde, y no hay forma de reconstruirlo después.

- **La cifra agregada puede divergir del detalle** → Si el recálculo falla o se olvida en algún camino de escritura, el dashboard muestra un número obsoleto sin señal de que lo es. Es la misma clase de falla silenciosa que ya costó rondas en este proyecto.

- **El único ofrecimiento de cita** → Si el umbral falla o el flujo se rompe ahí, el lead se pierde: no hay segunda oportunidad. Multiplicar los alcances multiplica los caminos que llegan a ese punto.

- **Diecisiete archivos leen la cifra por usuario** → Cualquiera que se pase a leer el detalle sin necesitarlo agranda el cambio sin beneficio. La columna agregada existe precisamente para que no haga falta tocarlos.

- **El enfriamiento por persona puede sentirse lento** → Alguien genuinamente interesado en dos desarrollos a la vez esperará más de lo que esperaría si cada uno tuviera su propio ritmo. Es el precio deliberado de no quemar el número.

- **Regresión con un solo alcance** → Todo lo anterior debe ser inerte cuando hay una sola rama, incluidas las cifras del dashboard.

## Migration Plan

1. Migración aditiva: alcance en la unicidad de los checkpoints, interés por persona y alcance, ofrecimiento por alcance, alcance de origen en las citas.
2. Atribución del progreso existente a la rama que corresponde, dentro de la misma migración: los datos actuales pertenecen a la única rama que existía.
3. Escritura del progreso por alcance, manteniendo la cifra agregada en la fila de la persona.
4. Umbral y ofrecimiento contados por rama.
5. Señal fuerte de compra.

**Rollback:** revertir el código deja las columnas nuevas sin usar y la cifra agregada intacta, que es la que leen las pantallas. Ninguna lectura previa depende de lo que se agrega.

## Open Questions

Ninguna. Las decisiones que quedaban abiertas —qué es un checkpoint, dónde se cuenta el umbral, dónde vive el score, cómo se evita el spam, y cómo se cubre la intensidad sin un clasificador— están resueltas arriba.

Lo que sí conviene revisar por separado, y no bloquea este cambio: el ofrecimiento de cita es el punto más frágil del sistema, porque es único y no tiene reintento. Merece su propia mirada una vez que este cambio lo haya multiplicado por rama.

## Verificación previa a producción

Antes de ejecutar las migraciones en el proyecto remoto se debe comprobar, sin escribir:

- que el historial remoto termina en la migración 028 y no contiene una versión divergente;
- cuántos alcances activos existen y cuál era la única rama vigente para el progreso anterior;
- los conteos de `user_checkpoints`, citas, ofertas y usuarios por `lead_score/lead_status`;
- que no hay checkpoints duplicados ni referencias de alcance huérfanas;
- que `bot_config` conserva `checkpoint_points`, el umbral, los límites de estado y el teléfono real del asesor;
- después de aplicar, que los conteos no cambian, todas las filas tienen alcance, el score agregado de cada usuario es idéntico y `user_scope_progress` tiene RLS y las políticas esperadas.

La aplicación remota debe hacerse solo después de comparar esos resultados con la línea base
del entorno y de ejecutar `test-scope-progress.ts` contra una copia local de sus datos.

## Decisiones que salieron de la revisión

### El agregado no filtra; la raíz no suma

La primera versión acotó el máximo agregado a las ramas activas de primer nivel. Esa restricción borraba historial en dos situaciones que no son hipotéticas:

**Al dar de alta el segundo desarrollo.** Todo el progreso anterior a los alcances vive en la raíz, que es exactamente el estado de producción hoy. En cuanto existe una rama, la raíz deja de contar, y cada lead histórico cae a cero en cuanto vuelve a escribir. Reproducido en local: el detalle decía 60 y el dashboard decía 0. La erosión además es gradual —solo al recalcular—, así que nadie la ve empezar.

**Al agotarse un desarrollo.** Sus leads calificados se apagaban con él, cuando son justamente las personas a las que el equipo quiere llamar para ofrecerles lo siguiente.

Un lead calificado no deja de estarlo porque cambie el catálogo. El agregado es el máximo entre todas las filas de progreso de la persona, sin filtrar.

Lo que evita que esa suma reintroduzca el defecto original vive en otro sitio: **la raíz puntúa solo lo que se le atribuyó a ella.** La raíz no es un desarrollo, es el tronco compartido; contar su subárbol completo sumaría el interés de todas las ramas en una cifra, que es el disparo falso que este cambio existe para eliminar. Lo atribuido a la raíz es interés real todavía sin asignar, y puntúa por sí solo.

Las dos reglas juntas son coherentes: cada alcance mide lo suyo sin cruzar a otra rama, y el agregado se queda con el mayor de esos números, viva donde viva.

### El score no se reescribe en cada mensaje

Recalcular en toda interacción sin checkpoint costaba una decena de consultas por mensaje para reescribir una cifra que no había cambiado —24 consultas para responder "ok", medidas con un contador sobre el cliente—. La spec pide iniciar el detalle en el primer contacto con un alcance, no mantenerlo al día en cada mensaje. Se recalcula al crear la fila y cuando algo cambia de verdad: un checkpoint, una cita, una respuesta a la oferta. El conteo bajó a 19.

Del mismo paso salió sustituir una consulta por descendiente por una sola con `in`.
