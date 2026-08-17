## MODIFIED Requirements

### Requirement: Una sola respuesta activa por pregunta y alcance

Para un par de pregunta y alcance SHALL existir como máximo una respuesta activa.

Aprobar una corrida SHALL retirar la respuesta que ocupaba ese lugar, sin pedir una confirmacion por cada una: la confirmacion es la de la corrida entera. Se SHALL conservar registro de cuál era y de que fue sustituida, para el editor de respuestas.

#### Scenario: La aprobación retira lo anterior

- **WHEN** existe una respuesta de precio activa en un alcance
- **AND** se aprueba una corrida que cubre el precio de ese alcance
- **THEN** la anterior queda inactiva
- **AND** un lead que pregunta el precio recibe una sola respuesta

#### Scenario: Una sola confirmacion para toda la corrida

- **WHEN** una corrida cubre doce preguntas que hoy tienen respuesta activa
- **THEN** aprobarla retira las doce
- **AND** no se pide confirmacion pregunta por pregunta

#### Scenario: Lo sustituido se puede consultar

- **WHEN** una respuesta fue sustituida
- **THEN** se conserva y se puede ver cuál era y cuándo dejó de usarse, desde el editor de respuestas

#### Scenario: Sustituir en un alcance no afecta a otro

- **WHEN** una corrida en modo anadir sustituye la respuesta de precio de un modelo
- **THEN** la del desarrollo y la de los demás modelos siguen activas

#### Scenario: Rechazar no retira nada

- **WHEN** se rechaza una respuesta compilada
- **THEN** la respuesta que estaba activa sigue activa

## REMOVED Requirements

### Requirement: El contenido aprobado no se reescribe sin que el cliente lo vea

**Reason**: Nacio para que el compilador conviviera con el contenido anterior, y esa convivencia es justamente lo que este cambio elimina. Presentar lo anterior junto a lo propuesto convirtio la pantalla de aprobacion en una comparacion entre dos epocas, cuando lo que el cliente pidio es que subir material nuevo deje el bot diciendo el material nuevo. La proteccion que aportaba —que nada llegue al lead sin que una persona lo apruebe— no se pierde: sigue viva en "Nada llega a un lead sin aprobación humana", y ahora la unidad que se aprueba es la corrida.

**Migration**: La pantalla de aprobacion deja de mostrar candidatas a sustituir y desaparece el panel de colisiones. Se retira `resolve_response_collision` y su endpoint. Las columnas `edited_by_human`, `superseded_by_response_id`, `deactivated_at` e `inactive_reason` se conservan, y siguen sirviendo al editor de respuestas para saber que fue de una respuesta anterior; ninguna interfaz nueva se construye alrededor de ellas en este cambio. Las colisiones que hoy existen en una base sembrada dejan de necesitar resolucion: la primera corrida que se apruebe las retira.
