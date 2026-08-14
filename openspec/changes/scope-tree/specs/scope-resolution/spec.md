## ADDED Requirements

### Requirement: Modelo de alcances jerárquico

El sistema SHALL representar los contextos de contenido como un árbol de alcances, donde cada alcance puede tener un alcance padre y cualquier número de alcances hijos. Un alcance sin padre es una raíz.

#### Scenario: Alcance raíz

- **WHEN** se consulta un alcance que no tiene padre
- **THEN** el sistema lo reconoce como raíz del árbol

#### Scenario: Jerarquía de varios niveles

- **WHEN** un alcance declara como padre a otro alcance
- **THEN** el sistema puede recorrer la cadena de ancestros desde cualquier nodo hasta su raíz

#### Scenario: Alcance inactivo

- **WHEN** un alcance está marcado como inactivo
- **THEN** el sistema no lo considera al resolver contenido para una conversación

#### Scenario: Integridad del árbol

- **WHEN** se intenta declarar como padre a un alcance que produciría un ciclo
- **THEN** el sistema rechaza la operación

### Requirement: Resolución de contenido por herencia

Al resolver el contenido de una intención para un alcance determinado, el sistema SHALL buscar primero en ese alcance y, de no encontrarlo, continuar por sus ancestros hasta la raíz, devolviendo el primer resultado encontrado.

#### Scenario: Contenido definido en el propio alcance

- **WHEN** se resuelve una intención en un alcance que tiene contenido propio para ella
- **THEN** el sistema devuelve ese contenido y no consulta a sus ancestros

#### Scenario: Contenido heredado de un ancestro

- **WHEN** se resuelve una intención en un alcance que no tiene contenido propio para ella, y un ancestro sí lo tiene
- **THEN** el sistema devuelve el contenido del ancestro más cercano que lo defina

#### Scenario: El hijo sustituye al padre

- **WHEN** un alcance y su ancestro definen contenido para la misma intención
- **THEN** el sistema devuelve el del alcance más profundo

#### Scenario: Contenido inexistente en toda la cadena

- **WHEN** ni el alcance ni ninguno de sus ancestros define contenido para la intención
- **THEN** el sistema informa que no hay contenido, sin error

### Requirement: Intenciones acotadas por alcance

Una intención SHALL pertenecer a un alcance o ser global. Su identificador SHALL ser único dentro de su alcance, no a nivel global, de modo que dos desarrollos puedan tener una intención con el mismo nombre y distinto contenido.

#### Scenario: Mismo nombre en alcances distintos

- **WHEN** dos alcances distintos definen una intención con el mismo nombre
- **THEN** el sistema las trata como intenciones diferentes, cada una con su propio contenido

#### Scenario: Nombre repetido dentro del mismo alcance

- **WHEN** se intenta crear una intención con un nombre que ya existe en ese alcance
- **THEN** el sistema rechaza la operación

#### Scenario: Intención global

- **WHEN** una intención no pertenece a ningún alcance
- **THEN** está disponible al resolver desde cualquier alcance del árbol

#### Scenario: Una intención de alcance tiene prioridad sobre la global

- **WHEN** existe una intención global y otra con el mismo nombre en el alcance desde el que se resuelve
- **THEN** el sistema usa la del alcance

### Requirement: Detección de intención dentro de un alcance

La detección de intención SHALL evaluar únicamente las intenciones visibles desde el alcance activo: las propias, las de sus ancestros y las globales.

#### Scenario: Detección acotada

- **WHEN** se detecta una intención estando en un alcance determinado
- **THEN** solo se consideran las intenciones visibles desde ese alcance
- **AND** las intenciones exclusivas de alcances no relacionados no se consideran

#### Scenario: Comportamiento con un solo alcance

- **WHEN** el sistema tiene un único alcance raíz
- **THEN** la detección de intención se comporta igual que antes de este cambio

### Requirement: Recursos acotados por alcance

Los recursos que el bot envía SHALL poder pertenecer a un alcance y resolverse con la misma herencia que el contenido, para que cada desarrollo disponga de sus propios archivos.

#### Scenario: Recurso propio del alcance

- **WHEN** se solicita un recurso desde un alcance que tiene el suyo
- **THEN** el sistema devuelve el recurso de ese alcance

#### Scenario: Recurso heredado

- **WHEN** un alcance no define un recurso y un ancestro sí
- **THEN** el sistema devuelve el del ancestro

### Requirement: Configuración resuelta por herencia

Los valores de configuración que admiten variación por alcance SHALL resolverse con el mismo recorrido ascendente que el contenido, de modo que definir un valor propio para un alcance no requiera cambios de esquema.

#### Scenario: Configuración heredada de la raíz

- **WHEN** un alcance no define un valor de configuración y la raíz sí
- **THEN** el sistema usa el valor de la raíz

#### Scenario: Configuración propia del alcance

- **WHEN** un alcance define su propio valor para una configuración
- **THEN** el sistema usa ese valor en lugar del heredado

### Requirement: Continuidad del contenido existente

La introducción del árbol de alcances SHALL preservar el contenido y el comportamiento actuales sin intervención manual.

#### Scenario: Contenido preexistente

- **WHEN** se aplica el cambio sobre una base con intenciones, respuestas y recursos ya configurados
- **THEN** todo ese contenido queda asociado a un alcance raíz
- **AND** sigue resolviéndose igual que antes del cambio

#### Scenario: El bot responde igual

- **WHEN** el sistema tiene un único alcance raíz y llega un mensaje
- **THEN** el bot detecta la intención y devuelve la misma respuesta que antes del cambio

#### Scenario: Esquema reproducible desde cero

- **WHEN** se crea una base nueva aplicando la secuencia completa de migraciones
- **THEN** la secuencia se aplica sin error y el esquema resultante incluye el árbol de alcances
