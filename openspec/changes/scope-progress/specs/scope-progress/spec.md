## ADDED Requirements

### Requirement: El checkpoint pertenece a un alcance

Un checkpoint SHALL identificarse por la persona, el alcance y la intención. Cubrir un tema en un alcance NO SHALL darlo por cubierto en otro.

#### Scenario: El mismo tema en dos desarrollos

- **WHEN** un lead cubre la misma intención de checkpoint en dos alcances distintos
- **THEN** quedan registrados dos checkpoints, uno por alcance

#### Scenario: El mismo tema repetido en el mismo alcance

- **WHEN** un lead vuelve a cubrir una intención de checkpoint ya registrada en ese alcance
- **THEN** el checkpoint no se duplica

#### Scenario: Checkpoint en un sub-alcance

- **WHEN** un lead cubre una intención de checkpoint en un alcance anidado dentro de un desarrollo
- **THEN** el checkpoint queda registrado en ese alcance
- **AND** cuenta para la rama de ese desarrollo

#### Scenario: Un solo alcance activo

- **WHEN** existe un único alcance activo
- **THEN** el registro de checkpoints es equivalente al anterior a este cambio

### Requirement: El umbral de la cita se cuenta dentro de la rama

El sistema SHALL evaluar el umbral que dispara el ofrecimiento de cita sobre los checkpoints de la rama en la que está el foco, y NO SHALL sumar los de otras ramas.

#### Scenario: Interés concentrado en un desarrollo

- **WHEN** un lead alcanza el umbral de checkpoints dentro de una misma rama
- **THEN** el sistema ofrece la cita de ese desarrollo

#### Scenario: Interés repartido entre desarrollos

- **WHEN** un lead acumula checkpoints en varias ramas sin alcanzar el umbral en ninguna
- **THEN** el sistema no ofrece cita

#### Scenario: El sub-alcance suma a su desarrollo

- **WHEN** los checkpoints de un lead están repartidos entre un desarrollo y sus sub-alcances, y juntos alcanzan el umbral
- **THEN** el sistema ofrece la cita de ese desarrollo

### Requirement: El interés se lleva por persona y alcance

El sistema SHALL mantener la calificación de interés de una persona en cada alcance por el que ha preguntado, de modo que su interés en uno no describa al otro.

#### Scenario: Interés distinto en dos desarrollos

- **WHEN** un lead ha profundizado en un desarrollo y apenas ha preguntado por otro
- **THEN** su calificación en cada alcance refleja lo que hizo en ese alcance

#### Scenario: Primer contacto con un alcance

- **WHEN** un lead interactúa por primera vez con un alcance
- **THEN** el sistema empieza a llevar su interés en ese alcance, sin afectar el que ya tenía en otros

### Requirement: La cifra por lead se conserva

El sistema SHALL seguir exponiendo una calificación y un estado por persona, derivados del detalle por alcance, para que las vistas existentes sigan funcionando sin cambios.

La agregación SHALL resolverse en un único lugar.

#### Scenario: Lectura desde el dashboard

- **WHEN** una vista consulta la calificación de un lead
- **THEN** obtiene una cifra y un estado por persona, como antes de este cambio

#### Scenario: El detalle cambia

- **WHEN** cambia la calificación de una persona en cualquier alcance
- **THEN** la cifra agregada refleja ese cambio

#### Scenario: Un solo alcance activo

- **WHEN** existe un único alcance activo
- **THEN** la cifra agregada es idéntica a la que el sistema calculaba antes de este cambio

### Requirement: El ofrecimiento de cita se lleva por alcance

Haber ofrecido una cita para un alcance NO SHALL impedir ofrecerla para otro.

#### Scenario: Oferta en un segundo desarrollo

- **WHEN** un lead ya recibió una oferta de cita para un alcance y después alcanza el umbral en otro
- **THEN** el sistema le ofrece la cita del segundo

#### Scenario: No repetir la oferta del mismo alcance

- **WHEN** un lead ya recibió una oferta de cita para un alcance y vuelve a alcanzar el umbral ahí
- **THEN** el sistema no repite la oferta de ese alcance

### Requirement: La cita conserva su alcance de origen

Una cita agendada SHALL registrar el alcance desde el que se originó.

#### Scenario: Cita nacida de un desarrollo

- **WHEN** un lead agenda una cita con el foco puesto en un alcance
- **THEN** la cita queda asociada a ese alcance

#### Scenario: Consulta por desarrollo

- **WHEN** se consultan las citas de un alcance
- **THEN** se obtienen las que nacieron de él

### Requirement: La frecuencia de la iniciativa se limita por persona

El sistema SHALL contar por persona, y no por alcance, cuántas veces toma la iniciativa —ofertas de cita y seguimientos— y el periodo de enfriamiento posterior a un rechazo.

#### Scenario: Interés en varios desarrollos

- **WHEN** un lead tiene interés activo en varios alcances a la vez
- **THEN** el sistema no le envía una secuencia de seguimiento por cada uno

#### Scenario: Enfriamiento tras un rechazo

- **WHEN** un lead rechaza una oferta de cita
- **THEN** el sistema respeta el enfriamiento antes de volver a tomar la iniciativa, sea cual sea el alcance

### Requirement: Una señal fuerte de compra adelanta el ofrecimiento

Una intención SHALL poder marcarse como señal fuerte de compra, y detectarla SHALL disparar el ofrecimiento de cita sin esperar al umbral de checkpoints.

La marca SHALL configurarse como el resto de las intenciones, sin escribirse en el código.

#### Scenario: Intención de compra explícita

- **WHEN** un lead expresa una intención marcada como señal fuerte
- **THEN** el sistema ofrece la cita del alcance en foco, aunque no haya alcanzado el umbral

#### Scenario: Sin señal fuerte configurada

- **WHEN** ninguna intención está marcada como señal fuerte
- **THEN** el ofrecimiento depende únicamente del umbral, como antes de este cambio

#### Scenario: La señal respeta la frecuencia

- **WHEN** una señal fuerte llega dentro del periodo de enfriamiento
- **THEN** el sistema no repite el ofrecimiento

### Requirement: El progreso existente se conserva

Al aplicar el cambio, el progreso ya registrado SHALL atribuirse al alcance que le corresponde, sin perderse ni duplicarse.

#### Scenario: Checkpoints anteriores al cambio

- **WHEN** se aplica el cambio sobre una base con checkpoints registrados
- **THEN** cada uno queda atribuido al alcance vigente cuando se registró

#### Scenario: Calificación anterior al cambio

- **WHEN** se aplica el cambio sobre una base con calificaciones registradas
- **THEN** la cifra por persona no cambia como efecto de la migración

## MODIFIED Requirements

### Requirement: Resolución desde el foco

La detección de intención y la resolución de contenido SHALL partir del foco de la conversación en lugar de asumir el alcance raíz.

El progreso que genere un mensaje —checkpoints, calificación y ofrecimiento— SHALL atribuirse a ese mismo foco.

#### Scenario: Contenido propio del foco

- **WHEN** se resuelve una intención con un foco establecido
- **THEN** se obtiene el contenido de ese alcance o el heredado de sus ancestros

#### Scenario: Comportamiento con un solo alcance

- **WHEN** existe un único alcance activo
- **THEN** la detección de intención y las respuestas son idénticas a las de antes del cambio `scope-routing`

#### Scenario: El progreso sigue al foco

- **WHEN** un mensaje cubre una intención de checkpoint con un foco establecido
- **THEN** el checkpoint se atribuye a ese alcance

#### Scenario: Cambio de foco durante la conversación

- **WHEN** un lead cambia de foco y cubre temas en el nuevo alcance
- **THEN** el progreso del alcance anterior permanece intacto
