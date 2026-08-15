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
