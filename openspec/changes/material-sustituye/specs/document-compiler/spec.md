## MODIFIED Requirements

### Requirement: Ingesta del material del cliente

El sistema SHALL aceptar el material de un cliente en texto plano, documento y PDF, conservarlo y asociarlo a un alcance.

Una corrida SHALL abrirse con varios materiales a la vez. El cliente entrega el material de su negocio completo —un archivo por desarrollo, o varios, o uno solo que los contenga a todos— y el compilador determina de ahi la estructura. Exigir una corrida por desarrollo obligaba al cliente a separar lo que el compilador tiene que deducir.

El material SHALL entregarse al modelo en su forma original mientras el formato lo permita, en lugar de aplanarse a texto. Aplanarlo pierde la disposición de la página y todo lo que no sea texto seleccionable.

Cuando el material no pueda leerse, el sistema SHALL decirlo, de forma distinguible de un material que sí se leyó y no contiene cierta información. Si uno de varios materiales de una corrida no se puede leer, el sistema SHALL decir cual, sin descartar los demas en silencio.

#### Scenario: Material aceptado

- **WHEN** un administrador entrega material en uno de los formatos admitidos para un alcance
- **THEN** el sistema lo conserva asociado a ese alcance y lo deja disponible para compilar

#### Scenario: Varios materiales en una corrida

- **WHEN** un administrador entrega dos archivos, cada uno con un desarrollo distinto del mismo negocio
- **THEN** ambos quedan asociados a la misma corrida
- **AND** la estructura propuesta contiene los dos desarrollos

#### Scenario: Uno de varios materiales no se lee

- **WHEN** una corrida abre con tres materiales y uno no se puede leer
- **THEN** el sistema indica cual fallo
- **AND** no continua como si la corrida tuviera solo dos

#### Scenario: Tabla de precios

- **WHEN** el material contiene una tabla de precios
- **THEN** los hechos que se extraen de ella conservan la correspondencia entre cada concepto y su cifra

#### Scenario: Dato dentro de una imagen

- **WHEN** el material contiene un dato dentro de una imagen y no como texto seleccionable
- **THEN** el sistema puede extraerlo igual

#### Scenario: Formato no admitido

- **WHEN** el material está en un formato que el sistema no puede procesar
- **THEN** el sistema lo rechaza indicando por qué, sin dejar una compilación a medias

#### Scenario: Material ilegible

- **WHEN** el material se acepta pero no produce nada utilizable
- **THEN** el sistema lo informa como un problema de lectura, distinguible de un material que sí se leyó y no contiene cierta información

## ADDED Requirements

### Requirement: La estructura propuesta describe el negocio, no una rama

La estructura que la corrida propone SHALL abarcar todo lo que el material describe: los desarrollos que contiene y lo que cuelga de cada uno.

Cuando el material nombra un desarrollo con varios nombres —el comercial y el de uso corriente— la estructura propuesta SHALL presentarlo como uno solo, con los demas nombres como alias para el ruteo, y NO SHALL proponer un alcance por cada forma de nombrarlo.

#### Scenario: Dos desarrollos en una corrida

- **WHEN** el material describe un negocio con dos desarrollos y sus modelos
- **THEN** la estructura propuesta contiene los dos desarrollos, cada uno con sus modelos colgando

#### Scenario: Un desarrollo con dos nombres

- **WHEN** el material dice "Residencial Europa, también conocido como Europa"
- **THEN** la estructura propone un solo desarrollo
- **AND** "Europa" queda como alias con el que un lead puede escogerlo

#### Scenario: Un lead escoge por el nombre corto

- **WHEN** se aprueba esa estructura
- **AND** un lead escribe "me interesa Europa"
- **THEN** el foco queda en ese desarrollo, sin ambiguedad y sin caer al fallback
