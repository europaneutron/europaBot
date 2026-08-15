## Why

El bot ya sabe de qué desarrollo se está hablando. Lo que no sabe es llevar la cuenta por separado.

Todo lo que mide interés es un solo estado por persona: `user_checkpoints` es único por `(user_id, intent_name)`, y `lead_score`, `lead_status` y `appointment_offered` son columnas de la fila del usuario. Con un solo desarrollo eso era correcto. Con dos deja de serlo, y falla en silencio en las dos direcciones:

- **Suma lo que no debe sumarse.** Alguien que pregunta el precio en dos desarrollos cruza el umbral de checkpoints sin haber profundizado en ninguno. El bot ofrece cita de algo que esa persona apenas está comparando.
- **Bloquea lo que sí debe pasar.** `appointment_offered` se marca una vez en la vida. Quien ya recibió una oferta para terrenos nunca recibirá una para casas, por interesado que esté.
- **Miente sobre el lead.** Una sola cifra por persona no puede decir que alguien está *hot* en terrenos y *cold* en casas. El dashboard muestra un promedio que no describe a nadie.

Nada de esto produce un error. El bot sigue funcionando y respondiendo bien; simplemente ofrece cita a quien no toca, no la ofrece a quien sí, y el equipo de ventas prioriza con una cifra que mezcla dos cosas distintas.

## What Changes

- El checkpoint pasa a ser el par intención y alcance: preguntar el precio de dos desarrollos son dos hechos distintos, no uno repetido.
- El umbral que dispara el ofrecimiento de cita se cuenta dentro de la rama, no sobre el total de la persona.
- El interés deja de ser una columna del usuario y pasa a ser una relación entre la persona y cada alcance por el que ha preguntado. La cifra que hoy ve el dashboard se sigue viendo, agregada hacia arriba del árbol.
- El ofrecimiento de cita deja de ser un hecho único en la vida del lead y pasa a llevarse por alcance.
- Las citas registran de qué alcance nacieron.
- La frecuencia con la que el bot toma la iniciativa —ofertas y seguimientos— se limita por persona, no por alcance.
- Una intención puede declararse señal fuerte de compra y disparar el ofrecimiento sin esperar al umbral.

**Fuera de alcance de este cambio:**

- Calificar el interés con un modelo de lenguaje. Contar es auditable y gratis; la señal fuerte se resuelve con una intención más, no con un clasificador.
- Rehacer el flujo de agendamiento. Solo gana el alcance del que nace.
- Interfaz de administración de alcances. Se siembran por SQL, como en `scope-routing`.
- Relación de una cita con varios alcances. Guarda el de origen; el resto lo averigua el asesor conversando.

Con un solo alcance activo, el comportamiento observable del bot es idéntico al actual, incluidas las cifras del dashboard.

## Capabilities

### New Capabilities

- `scope-progress`: seguimiento del interés de una persona en cada alcance —checkpoints, calificación y ofrecimiento de cita— y agregación hacia arriba del árbol.

### Modified Capabilities

- `scope-routing`: el alcance resuelto para un mensaje pasa a ser también el alcance al que se le atribuye el progreso.

## Impact

**Base de datos**

- Migraciones nuevas a partir de la 029, aditivas.
- `user_checkpoints`: alcance en la clave de unicidad.
- Interés por persona y alcance, con su calificación.
- Ofrecimiento de cita por alcance.
- Alcance de origen en `appointments`.
- `users.lead_score` y `users.lead_status` quedan como cifra agregada, alimentada desde el detalle por alcance.

**Código afectado**

- `src/core/scoring/lead-scorer.ts`: hoy calcula un score por usuario a partir de un conteo global.
- `src/core/conversation/message-processor.ts`: marca checkpoints y evalúa el umbral que dispara la oferta.
- `src/core/appointment/appointment-manager.ts`: el flujo de cita y su registro.
- `src/core/fallback/fallback-handler.ts`: la derivación a asesor lee el estado del lead.
- `src/core/followup/`: la frecuencia de los seguimientos.
- `src/data/repositories/user.repository.ts`: checkpoints, score y ofrecimiento.
- `src/data/repositories/advisor.repository.ts` y los hooks del dashboard: leen la cifra por usuario y deben seguir leyéndola.

**Sin impacto**

- El algoritmo del matcher y la detección de intención.
- La resolución de contenido por herencia.
- El envío a WhatsApp y el compositor de respuestas.
- El comportamiento del bot mientras exista un solo alcance activo.
