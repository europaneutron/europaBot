## ADDED Requirements

### Requirement: El vocabulario sale del material y esta en la lengua del lead

Cada respuesta compilada SHALL publicarse con el vocabulario que permite alcanzarla: las palabras con las que un lead pregunta por eso, sus sinonimos, sus erratas frecuentes y frases completas.

Ese vocabulario SHALL derivarse del material del cliente y no de una lista fija del sector. Si el material dice "casas" y "lotes de terreno", el bot entiende esas palabras sin que nadie las escriba a mano; el siguiente cliente vende bodegas y el mismo mecanismo tiene que servirle.

El nombre de la pregunta NO SHALL ser el vocabulario. Publicar `precio` con `{precio}` y sin sinonimos deja la pregunta inalcanzable para cualquier forma normal de preguntarla.

#### Scenario: Las palabras del material llegan al matcher

- **WHEN** el material dice que en un desarrollo se venden casas y lotes de terreno
- **AND** se compila y se publica
- **AND** un lead escribe "que casas manejan"
- **THEN** recibe la respuesta de modelos, no el fallback

#### Scenario: Una forma corriente de preguntar el precio

- **WHEN** se publica el contenido de precio de un desarrollo
- **AND** un lead escribe "cuanto cuesta"
- **THEN** recibe el precio, no el fallback

#### Scenario: El vocabulario no se reduce al nombre

- **WHEN** se publica cualquier respuesta compilada
- **THEN** su vocabulario contiene mas que las palabras de su propio nombre

#### Scenario: El sector no esta cableado

- **WHEN** el material describe un producto que no es vivienda
- **THEN** el vocabulario publicado usa las palabras de ese material

### Requirement: Una propuesta que no reconoce su propia pregunta no se publica

Antes de publicar, cada propuesta SHALL comprobarse contra el mismo matcher que usa el runtime: se le pasa la pregunta del catalogo que dice cubrir y un par de reformulaciones corrientes, y el vocabulario propuesto tiene que engancharlas.

La comprobacion SHALL ser determinista y ejecutarse despues del modelo. Es lo que impide que una lista vacia llegue a produccion cuando el modelo tiene un mal dia.

Una propuesta que no la pase SHALL quedar fuera de la publicacion y mostrarse explicando por que, en vez de publicarse muda.

#### Scenario: Listas vacias

- **WHEN** el modelo devuelve una propuesta con los sinonimos y las frases vacios
- **THEN** la propuesta no se publica
- **AND** el panel dice que su vocabulario no alcanza la pregunta que dice cubrir

#### Scenario: La comprobacion usa el matcher del runtime

- **WHEN** se comprueba una propuesta
- **THEN** se usa el mismo matcher que resuelve los mensajes de los leads, no una comparacion aparte

#### Scenario: Una propuesta bloqueada no detiene a las demas

- **WHEN** una de doce propuestas no pasa la comprobacion
- **THEN** las once restantes se publican
- **AND** la pregunta de la bloqueada conserva lo que hubiera antes

#### Scenario: Recompilar puede desbloquear

- **WHEN** una propuesta quedo bloqueada por vocabulario pobre
- **AND** se vuelve a compilar el mismo material
- **AND** la propuesta nueva pasa la comprobacion
- **THEN** se publica sin intervencion aparte

### Requirement: Las preguntas se nombran con un catalogo estable

Una pregunta que el catalogo ya contempla SHALL publicarse con su nombre estable —`precio`, `ubicacion`, `modelo`, `amenidades`, `creditos`, `seguridad`, `brochure`— y no con un nombre inventado por corrida.

Una pregunta que el material aporta y el catalogo no contempla SHALL admitirse, con un nombre en lengua de lead y sometida a la misma comprobacion de vocabulario.

Dos corridas del mismo material NO SHALL producir nombres distintos para la misma pregunta.

#### Scenario: La pregunta de siempre conserva su nombre

- **WHEN** el material describe precios por modelo
- **THEN** la propuesta se nombra `precio`, no `precio_modelos` ni `fichas_modelos`

#### Scenario: Una pregunta propia del cliente

- **WHEN** el material describe algo que el catalogo no contempla
- **THEN** la propuesta se admite con un nombre que un lead reconoceria
- **AND** pasa la misma comprobacion de vocabulario que las demas

#### Scenario: Dos corridas, el mismo nombre

- **WHEN** se compila dos veces el mismo material
- **THEN** las preguntas equivalentes se nombran igual en ambas

### Requirement: Publicar no empobrece una pregunta

Cuando el vocabulario que llega para una pregunta es mas pobre que el que esa pregunta ya tenia, la sustitucion SHALL marcarse en vez de aplicarse en silencio.

Es la salvaguarda del caso que este cambio existe para evitar: una pregunta que hoy entiende cinco formas de preguntarla y despues de publicar entiende una.

#### Scenario: El vocabulario nuevo es mas pobre

- **WHEN** una pregunta tiene vocabulario para varias formas de preguntarla
- **AND** la propuesta nueva trae menos
- **THEN** se marca antes de publicar, indicando que formas se pierden

#### Scenario: El vocabulario nuevo es mejor

- **WHEN** la propuesta nueva reconoce todo lo que reconocia la anterior y algo mas
- **THEN** se publica sin marca

### Requirement: El runtime sigue sin llamar al modelo

Toda la generacion y la comprobacion del vocabulario SHALL ocurrir durante la compilacion. Responder un mensaje NO SHALL llamar a ningun modelo.

#### Scenario: Un mensaje no llama al modelo

- **WHEN** un lead escribe cualquier cosa
- **THEN** la respuesta se resuelve solo con el matcher y la base
