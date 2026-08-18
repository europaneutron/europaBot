## ADDED Requirements

### Requirement: Una respuesta declara los datos de los que depende

Una respuesta publicada SHALL declarar que valores del catalogo necesita para poder enviarse. Esa dependencia SHALL decidir si se publica y si se envia.

#### Scenario: La dependencia se registra al publicar

- **WHEN** se publica una respuesta con huecos
- **THEN** queda registrado que valores necesita y de que alcance

#### Scenario: Se retira el dato del que depende

- **WHEN** se borra del catalogo un valor que una respuesta activa necesita
- **THEN** la respuesta queda marcada como incompleta
- **AND** deja de enviarse hasta que el valor exista

#### Scenario: Una respuesta sin huecos no cambia

- **WHEN** una respuesta no referencia ningun valor
- **THEN** se publica y se envia como hasta ahora
