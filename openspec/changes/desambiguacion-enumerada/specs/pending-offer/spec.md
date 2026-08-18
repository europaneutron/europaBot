## ADDED Requirements

### Requirement: Toda oferta deja constancia

Cuando el bot ofrece algo —enumerar opciones, mostrar una ficha, agendar— el sistema SHALL registrar que ofrecio y a que alcance apunta cada opcion, junto a la conversacion del lead.

#### Scenario: El bot enumera

- **WHEN** el bot manda una enumeracion de alcances
- **THEN** queda registrada la oferta con sus opciones y el alcance de cada una

#### Scenario: La oferta caduca

- **WHEN** el lead escribe algo que el bot contesta sin usar la oferta
- **THEN** la oferta deja de estar viva y no puede resolverse mas tarde por accidente

### Requirement: Un afirmativo se resuelve contra la oferta viva

Un mensaje afirmativo —"si", "claro", "dale", "ok"— SHALL resolverse contra la oferta pendiente. El sistema SHALL NOT tratar un afirmativo como texto para el matcher general.

#### Scenario: Si con una oferta de una sola cosa

- **WHEN** el bot ofrecio mostrar los modelos y el lead responde "si"
- **THEN** el bot muestra los modelos

#### Scenario: Si con una oferta de varias opciones

- **WHEN** el bot enumero dos desarrollos y el lead responde "si"
- **THEN** el bot repite las opciones porque el afirmativo no elige entre ellas

#### Scenario: Si sin oferta viva

- **WHEN** el lead escribe "si" y no hay ninguna oferta pendiente
- **THEN** el bot responde preguntando a que se refiere y ofrece las opciones disponibles
- **AND** no cae al fallback generico

### Requirement: Una oferta de si o no se declara para poder publicarse

Una respuesta cuyo texto termina en una pregunta de si o no SHALL declarar que ofrece. El compilador SHALL NOT publicar una respuesta de si o no sin oferta declarada, y SHALL indicarlo en la pantalla de aprobacion.

#### Scenario: Respuesta con oferta declarada

- **WHEN** una propuesta termina en "¿te muestro los modelos?" y declara que ofrece la enumeracion de modelos
- **THEN** se publica

#### Scenario: Respuesta sin oferta declarada

- **WHEN** una propuesta termina en "¿te interesa ver los planos?" y no declara oferta
- **THEN** no se publica
- **AND** la pantalla de aprobacion dice que la pregunta de si o no no tiene a que responder

#### Scenario: Una respuesta que no pregunta

- **WHEN** una propuesta no termina en pregunta de si o no
- **THEN** la regla no aplica y se publica como cualquier otra
