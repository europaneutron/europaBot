## ADDED Requirements

### Requirement: Una respuesta general dice de quien habla

Una respuesta publicada en un alcance que reune datos de varios descendientes SHALL nombrar el descendiente al que pertenece cada dato. El compilador SHALL marcar como no publicable la respuesta que enumera datos de mas de una rama sin nombrarlas.

#### Scenario: Precio general del negocio

- **WHEN** la respuesta de precio de la raiz reune modelos de dos desarrollos
- **THEN** cada modelo aparece con su desarrollo
- **AND** el lead puede saber cual pertenece a cual sin preguntar

#### Scenario: Precio general de un desarrollo

- **WHEN** la respuesta de precio de un desarrollo reune solo modelos suyos
- **THEN** no hace falta nombrar la rama, porque no hay mas de una

#### Scenario: Una respuesta que cruza ramas sin nombrarlas

- **WHEN** una propuesta enumera datos de dos desarrollos sin decir de cual es cada uno
- **THEN** no se publica
- **AND** la pantalla de aprobacion dice que la respuesta mezcla ramas

### Requirement: Una respuesta que ofrece declara su oferta

Una respuesta publicada cuyo texto termina en una pregunta de si o no SHALL declarar que ofrece, para que el afirmativo del lead tenga contra que resolverse.

#### Scenario: Oferta declarada

- **WHEN** una propuesta termina en "¿te muestro los modelos?" y declara la enumeracion de modelos como su oferta
- **THEN** se publica

#### Scenario: Oferta sin declarar

- **WHEN** una propuesta termina en una pregunta de si o no y no declara oferta
- **THEN** no se publica
- **AND** el motivo se ve en la pantalla de aprobacion

#### Scenario: La oferta apunta a algo que existe

- **WHEN** una propuesta declara ofrecer la enumeracion de un nivel que no tiene alcances vivos
- **THEN** no se publica
