## ADDED Requirements

### Requirement: Ruteo por anuncio de origen

Cuando un mensaje se origina en un anuncio asociado a un alcance, el sistema SHALL establecer ese alcance como foco de la conversación, sin depender del texto del mensaje.

#### Scenario: Primer mensaje desde un anuncio conocido

- **WHEN** llega un mensaje cuyo origen es un anuncio asociado a un alcance
- **THEN** el foco de la conversación queda en ese alcance
- **AND** la respuesta se resuelve desde ahí, aunque el texto del mensaje no mencione ningún desarrollo

#### Scenario: Anuncio no asociado a ningún alcance

- **WHEN** llega un mensaje desde un anuncio que no está asociado a ningún alcance
- **THEN** el sistema continúa sin foco de anuncio y determina el alcance por los demás medios disponibles

#### Scenario: Mensaje sin origen de anuncio

- **WHEN** llega un mensaje que no proviene de un anuncio
- **THEN** el sistema determina el alcance por los demás medios disponibles, sin error

#### Scenario: El origen se registra

- **WHEN** un mensaje proviene de un anuncio
- **THEN** el sistema conserva el identificador del anuncio asociado a esa conversación, de modo que pueda atribuirse el lead a la campaña

### Requirement: Foco de la conversación

La sesión SHALL mantener el alcance sobre el que se está conversando, y ese foco SHALL persistir entre mensajes hasta que algo lo cambie.

#### Scenario: Continuidad del foco

- **WHEN** un lead con foco establecido envía un mensaje que no indica ningún alcance
- **THEN** la intención y la respuesta se resuelven desde el foco vigente

#### Scenario: Conversación sin foco previo

- **WHEN** un lead sin foco establecido envía un mensaje
- **AND** ni el origen ni el contenido permiten determinar un alcance
- **THEN** el sistema resuelve desde el alcance raíz

#### Scenario: El foco sobrevive a la conversación

- **WHEN** un lead vuelve a escribir después de un tiempo sin actividad
- **THEN** conserva el foco que tenía, sin necesidad de volver a indicarlo

### Requirement: Cambio de foco por mención

Cuando el lead nombra un alcance mediante uno de sus alias, el sistema SHALL cambiar el foco a ese alcance, sin importar su profundidad en el árbol.

#### Scenario: El lead nombra un desarrollo

- **WHEN** el mensaje contiene un alias de un alcance activo distinto del foco actual
- **THEN** el foco cambia a ese alcance
- **AND** la respuesta se resuelve desde ahí

#### Scenario: Mención de un alcance profundo

- **WHEN** el lead nombra directamente un alcance que no es hijo inmediato de la raíz
- **THEN** el foco salta a ese alcance sin exigir que antes se indiquen sus ancestros

#### Scenario: El foco anterior queda registrado

- **WHEN** el foco cambia de un alcance a otro
- **THEN** el sistema conserva cuál era el foco previo

#### Scenario: Alias de un alcance inactivo

- **WHEN** el mensaje contiene un alias de un alcance que no está activo
- **THEN** el foco no cambia

### Requirement: Resolución desde el foco

La detección de intención y la resolución de contenido SHALL partir del foco de la conversación en lugar de asumir el alcance raíz.

#### Scenario: Contenido propio del foco

- **WHEN** se resuelve una intención con un foco establecido
- **THEN** se obtiene el contenido de ese alcance o el heredado de sus ancestros

#### Scenario: Comportamiento con un solo alcance

- **WHEN** existe un único alcance activo
- **THEN** la detección de intención y las respuestas son idénticas a las de antes de este cambio

### Requirement: Saludo compuesto con los alcances disponibles

El mensaje de saludo SHALL poder enumerar los alcances activos disponibles a partir de los datos, sin que ese listado tenga que mantenerse a mano en el texto.

#### Scenario: Saludo sin foco establecido

- **WHEN** un lead sin foco saluda
- **THEN** el saludo presenta los alcances activos disponibles

#### Scenario: Alta de un alcance nuevo

- **WHEN** se activa un alcance nuevo
- **THEN** el saludo lo incluye sin necesidad de editar el texto del mensaje

#### Scenario: Un solo alcance disponible

- **WHEN** existe un único alcance activo
- **THEN** el saludo no plantea una elección al lead

#### Scenario: Saludo con foco ya establecido

- **WHEN** un lead cuyo foco ya está determinado por el anuncio de origen saluda
- **THEN** el saludo no le pide elegir un desarrollo

### Requirement: Trazabilidad del alcance en la conversación

Cada mensaje registrado SHALL conservar el alcance desde el que se resolvió.

#### Scenario: Registro del alcance

- **WHEN** se registra un mensaje entrante o saliente
- **THEN** queda asociado al alcance vigente en ese momento

#### Scenario: Historial con cambios de foco

- **WHEN** una conversación cambió de foco durante su transcurso
- **THEN** el historial permite distinguir desde qué alcance se resolvió cada mensaje

## MODIFIED Requirements

### Requirement: Resolución de contenido por herencia

Al resolver el contenido de una intención para un alcance determinado, el sistema SHALL buscar primero en ese alcance y, de no encontrarlo, continuar por sus ancestros hasta la raíz, devolviendo el primer resultado encontrado.

El alcance de partida SHALL ser el foco de la conversación cuando exista, y el alcance raíz cuando no.

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

#### Scenario: Partida desde el foco de la conversación

- **WHEN** una conversación tiene foco establecido
- **THEN** la resolución parte de ese alcance y no del raíz
