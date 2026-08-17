## ADDED Requirements

### Requirement: El contenido se escribe donde vive el dato

Una respuesta compilada SHALL crearse en el alcance al que pertenecen los hechos que la sostienen.

Cuando los hechos que sostienen una respuesta están atribuidos a un descendiente del alcance de la corrida, la respuesta SHALL crearse en ese descendiente. Cuando los hechos pertenecen al alcance de la corrida, o a varios descendientes a la vez, la respuesta SHALL crearse en el alcance de la corrida.

#### Scenario: Un precio por modelo produce una respuesta por modelo

- **WHEN** el material da tres precios atribuidos a tres modelos distintos
- **AND** se compila el desarrollo que los contiene
- **THEN** se propone una respuesta de precio en cada uno de los tres modelos

#### Scenario: Un dato del desarrollo se queda en el desarrollo

- **WHEN** el material da una dirección sin atribuirla a ningún modelo
- **THEN** la respuesta de ubicación se propone en el desarrollo, no en sus modelos

#### Scenario: Un dato compartido por los modelos sube al desarrollo

- **WHEN** el mismo hecho está atribuido a todos los modelos de un desarrollo
- **THEN** la respuesta se propone una sola vez, en el desarrollo

#### Scenario: Dos desarrollos no se pisan

- **WHEN** se compila un desarrollo y después otro
- **THEN** cada uno tiene su propia respuesta para la misma pregunta
- **AND** aprobar la del segundo no modifica ni desactiva la del primero

### Requirement: La intención que falta se crea

Cuando el material sustenta una pregunta para la que no existe intención en el alcance destino, el sistema SHALL crear esa intención en ese alcance en lugar de descartar la propuesta.

Una intención creada así SHALL ser indistinguible en comportamiento de una configurada a mano: participa en la detección, se puede editar y se puede desactivar.

#### Scenario: Una pregunta nueva no se pierde

- **WHEN** el material sustenta una pregunta sobre amenidades y no existe una intención para ella
- **THEN** se crea la intención y la respuesta se propone
- **AND** un lead que pregunta por amenidades la recibe una vez aprobada

#### Scenario: Un alcance que hereda no duplica la intención

- **WHEN** el alcance destino ya resuelve esa pregunta heredándola de un ancestro
- **AND** el material da un valor propio para ese alcance
- **THEN** se crea la intención en el alcance destino
- **AND** la del ancestro se conserva sin cambios

#### Scenario: Nada se descarta en silencio

- **WHEN** el compilador no puede colocar una propuesta
- **THEN** el hecho queda visible como pendiente en la revisión, con el motivo
- **AND** no desaparece sin dejar rastro

### Requirement: Una sola respuesta activa por pregunta y alcance

Para un par de pregunta y alcance SHALL existir como máximo una respuesta activa.

Aprobar una respuesta compilada SHALL desactivar la que ocupaba ese lugar, conservando registro de cuál era y de que fue sustituida. La respuesta anterior no SHALL borrarse.

#### Scenario: La aprobación retira lo anterior

- **WHEN** existe una respuesta de precio activa en un alcance
- **AND** se aprueba una respuesta de precio compilada para ese mismo alcance
- **THEN** la anterior queda inactiva
- **AND** un lead que pregunta el precio recibe una sola respuesta

#### Scenario: Lo sustituido se puede consultar

- **WHEN** una respuesta fue sustituida
- **THEN** se conserva y se puede ver cuál era y cuándo dejó de usarse

#### Scenario: Sustituir en un alcance no afecta a otro

- **WHEN** se sustituye la respuesta de precio de un modelo
- **THEN** la del desarrollo y la de los demás modelos siguen activas

#### Scenario: Rechazar no retira nada

- **WHEN** se rechaza una respuesta compilada
- **THEN** la respuesta que estaba activa sigue activa

### Requirement: Un seguimiento es un fragmento, no otra respuesta

Cuando una respuesta requiera enviarse en varios mensajes, esos mensajes SHALL ser fragmentos de una sola respuesta y no respuestas distintas para la misma pregunta y alcance.

#### Scenario: El contenido existente de varios mensajes se conserva

- **WHEN** una pregunta tiene hoy un mensaje principal y un seguimiento como respuestas separadas
- **AND** se aplica este cambio
- **THEN** el lead sigue recibiendo los dos mensajes, en el mismo orden
- **AND** ambos pertenecen a una sola respuesta

#### Scenario: El texto no se reescribe

- **WHEN** se convierte una secuencia existente en fragmentos
- **THEN** el texto de cada mensaje se conserva literal

### Requirement: El contenido aprobado no se reescribe sin que el cliente lo vea

Ninguna migración ni proceso automático SHALL modificar ni desactivar el texto de una respuesta que el cliente aprobó o redactó, sin presentárselo y obtener su confirmación.

Cuando este cambio detecte contenido anterior que debería retirarse, SHALL mostrarlo para que una persona decida.

#### Scenario: Lo sembrado que colisiona se muestra, no se borra

- **WHEN** al aplicar el cambio se detectan varias respuestas activas para la misma pregunta y alcance
- **THEN** se presentan juntas indicando cuál propone conservarse
- **AND** ninguna se desactiva hasta que una persona lo confirme

#### Scenario: Un texto redactado por el cliente sobrevive

- **WHEN** una respuesta fue editada por una persona
- **AND** se compila contenido nuevo para esa pregunta y alcance
- **THEN** la sustitución exige confirmación explícita, indicando que la anterior fue editada a mano

### Requirement: La conversación objetivo se sostiene con contenido compilado

Los turnos de `openspec/conversacion-objetivo.md` que hoy pasan sembrando el contenido a mano SHALL pasar igual cuando el contenido lo produzca el compilador.

#### Scenario: El precio del modelo llega desde el compilador

- **WHEN** se compila el material de un desarrollo con tres modelos y precios distintos
- **AND** se aprueba lo propuesto
- **AND** un lead con el foco en uno de los modelos pregunta el precio
- **THEN** recibe el precio de ese modelo

#### Scenario: Lo que no está en el modelo se hereda

- **WHEN** el lead tiene el foco en un modelo y pregunta la ubicación
- **AND** la ubicación solo está definida en el desarrollo
- **THEN** recibe la del desarrollo

#### Scenario: Una sola respuesta por turno

- **WHEN** un lead pregunta el precio en cualquier alcance
- **THEN** recibe una sola respuesta, no dos versiones seguidas
