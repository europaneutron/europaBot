## ADDED Requirements

### Requirement: El catalogo es el estado actual, no el resultado de una corrida

El sistema SHALL guardar los valores del catalogo acotados por alcance, con su clave, su valor y su procedencia. Un valor SHALL sobrevivir a la corrida que lo produjo y SHALL poder editarse sin recompilar.

#### Scenario: Publicar escribe el catalogo

- **WHEN** se aprueba una corrida que extrajo el precio de un modelo
- **THEN** ese precio queda en el catalogo del modelo
- **AND** sigue disponible cuando la corrida ya no es la ultima

#### Scenario: Un valor se corrige sin recompilar

- **WHEN** una persona cambia el precio de un modelo en la tabla
- **THEN** el bot contesta el precio nuevo en el siguiente mensaje
- **AND** no hace falta volver a subir material

#### Scenario: El catalogo se acota por alcance

- **WHEN** dos modelos tienen un precio propio
- **THEN** cada uno vive en su alcance
- **AND** cambiar uno no toca el otro

### Requirement: Cada valor dice de donde salio

Un valor del catalogo SHALL conservar su procedencia: el documento y la pagina cuando lo extrajo el compilador, o la marca de edicion humana cuando lo escribio una persona.

#### Scenario: Valor extraido del material

- **WHEN** se consulta un valor que vino de un documento
- **THEN** se ve de que documento y de que pagina salio

#### Scenario: Valor escrito por una persona

- **WHEN** alguien edita un valor en la tabla
- **THEN** queda marcado como editado por una persona, con quien y cuando

#### Scenario: La procedencia no se pierde al editar

- **WHEN** se edita un valor que venia de un documento
- **THEN** se conserva de donde venia ademas de la marca de edicion

### Requirement: La tabla del catalogo se ve y se edita

El sistema SHALL presentar los valores de un alcance como una tabla, con el dato y su fuente al lado, y SHALL permitir editar cada valor desde ahi.

#### Scenario: La tabla de un desarrollo

- **WHEN** se abre el catalogo de un desarrollo
- **THEN** se ven sus valores propios y los de sus modelos
- **AND** cada uno con su procedencia

#### Scenario: Un valor invalido no se guarda

- **WHEN** alguien escribe un valor que no corresponde al tipo del dato
- **THEN** no se guarda
- **AND** se dice por que

### Requirement: Sustituir avisa antes de descartar una correccion

Al aprobar una corrida en modo sustituir, el sistema SHALL indicar que valores editados por una persona van a ser reemplazados por el material, antes de aprobar.

#### Scenario: Una corrida trae otro precio que el corregido a mano

- **WHEN** una persona corrigio el precio de un modelo y la corrida nueva trae otro
- **THEN** la pantalla de aprobacion lo dice, con los dos valores
- **AND** aprobar deja el valor del material, como cualquier otro contenido

#### Scenario: Sin correcciones que descartar

- **WHEN** ningun valor de la corrida sustituye a uno editado a mano
- **THEN** no se muestra ningun aviso

#### Scenario: El modo anadir no toca lo corregido

- **WHEN** la corrida es en modo anadir
- **THEN** los valores existentes se conservan
