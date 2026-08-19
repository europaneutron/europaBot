## ADDED Requirements

### Requirement: El rotulo corto se comprueba, no solo se pide

El compilador SHALL comprobar que el rotulo corto de cada pregunta cabe en un boton antes de publicarlo. Un rotulo que no cabe SHALL pedirse de nuevo, y si vuelve a no caber la propuesta SHALL publicarse con un rotulo derivado de forma determinista en vez de con la pregunta entera.

#### Scenario: Rotulo que cabe

- **WHEN** el modelo devuelve "Recamaras y banos" para una pregunta
- **THEN** se publica tal cual

#### Scenario: Rotulo demasiado largo

- **WHEN** el modelo devuelve un rotulo de mas de veinte caracteres
- **THEN** se le pide de nuevo solo ese rotulo
- **AND** si el segundo tampoco cabe, se publica uno derivado de la clave de la pregunta

#### Scenario: Rotulo que es la pregunta

- **WHEN** el modelo devuelve la pregunta entera como rotulo
- **THEN** no se publica como rotulo
- **AND** se aplica la misma regla que a uno demasiado largo

#### Scenario: El rotulo no cambia la pregunta

- **WHEN** se corrige el rotulo de una pregunta
- **THEN** su vocabulario y sus respuestas siguen igual
