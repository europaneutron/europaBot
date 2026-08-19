## ADDED Requirements

### Requirement: Una pregunta es una fila

La lista de preguntas SHALL presentar una fila por pregunta, no una por registro. Una pregunta que existe en varios alcances SHALL aparecer una sola vez, indicando en cuantos alcances tiene respuesta.

#### Scenario: La misma pregunta en varios alcances

- **WHEN** seis alcances tienen respuesta propia de precio
- **THEN** la lista enseña una fila de precio
- **AND** dice que hay seis respuestas

#### Scenario: Una pregunta de un solo alcance

- **WHEN** una pregunta existe en un unico alcance
- **THEN** aparece igual que las demas, con una respuesta

#### Scenario: Buscar una pregunta

- **WHEN** se busca por el nombre de la pregunta
- **THEN** se encuentra la fila
- **AND** no aparecen tantas coincidencias como alcances

### Requirement: El arbol vive dentro de la pregunta

Al abrir una pregunta, el sistema SHALL presentar el arbol de alcances alcanzables con la respuesta de cada uno, distinguiendo la que es propia de la que se hereda.

#### Scenario: Respuestas propias y heredadas

- **WHEN** se abre una pregunta que el negocio responde en general y tres modelos responden aparte
- **THEN** se ve la respuesta general con su alcance
- **AND** cada modelo con su respuesta propia
- **AND** los alcances sin respuesta propia marcados como que heredan

#### Scenario: De donde salio cada respuesta

- **WHEN** una respuesta la escribio el compilador
- **THEN** se ve de que documento y pagina salio

#### Scenario: Un alcance retirado no aparece

- **WHEN** un alcance fue retirado por una sustitucion
- **THEN** no aparece en el arbol de la pregunta

### Requirement: Heredar es un estado del que se puede salir y al que se puede volver

Desde el arbol de una pregunta, el sistema SHALL permitir escribir una respuesta propia para un alcance que hereda, y SHALL permitir borrar una respuesta propia para volver a heredar.

#### Scenario: Escribir una propia

- **WHEN** un alcance hereda la respuesta general y se escribe una propia
- **THEN** ese alcance pasa a responder la suya
- **AND** los demas siguen igual

#### Scenario: Volver a heredar

- **WHEN** se borra la respuesta propia de un alcance
- **THEN** vuelve a contestar la general
- **AND** no queda sin respuesta

#### Scenario: Borrar la general

- **WHEN** se intenta borrar la respuesta del alcance del que otros heredan
- **THEN** el sistema advierte a cuantos alcances deja sin respuesta antes de hacerlo
