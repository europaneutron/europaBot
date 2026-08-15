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

#### Scenario: Anuncio que apunta a un alcance inactivo

- **WHEN** llega un mensaje desde un anuncio asociado a un alcance que ya no está activo
- **THEN** el sistema no establece ese alcance como foco
- **AND** trata la conversación como si no tuviera origen de anuncio, ofreciendo los alcances que sí están disponibles

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

#### Scenario: El foco sobrevive dentro de la misma conversación

- **WHEN** un lead vuelve a escribir dentro de la ventana de conversación vigente
- **THEN** conserva el foco que tenía, sin necesidad de volver a indicarlo

### Requirement: Caducidad del foco

El foco SHALL caducar tras un periodo de inactividad, de modo que una conversación nueva no arrastre el supuesto de que el lead sigue interesado en el mismo alcance.

La caducidad SHALL alcanzar únicamente al foco. El historial del lead y su relación con los alcances por los que ha preguntado no se ven afectados.

#### Scenario: Regreso dentro de la ventana

- **WHEN** un lead con foco establecido escribe antes de que venza el periodo de inactividad
- **THEN** conserva su foco

#### Scenario: Regreso después de la ventana

- **WHEN** un lead escribe después de que venció el periodo de inactividad
- **THEN** el foco deja de aplicarse y el alcance se determina de nuevo
- **AND** su historial de conversación permanece intacto

#### Scenario: El origen vuelve a establecer el foco

- **WHEN** un lead cuyo foco caducó vuelve a escribir desde un anuncio o nombrando un alcance
- **THEN** el foco se establece de nuevo sin intervención adicional

### Requirement: Desambiguación cuando la pregunta depende del alcance

Cuando el sistema no puede determinar el alcance y la intención detectada tiene contenido distinto en varios alcances activos, SHALL pedir al lead que indique de cuál se trata en lugar de responder con un contenido arbitrario.

La condición SHALL derivarse de los datos: una intención depende del alcance cuando varios alcances activos definen contenido propio para ella. No requiere marcarla como tal.

#### Scenario: Pregunta dependiente del alcance sin foco

- **WHEN** un lead sin foco pregunta algo cuya respuesta está definida por separado en varios alcances activos
- **THEN** el sistema le pide que indique de cuál desarrollo se trata
- **AND** no responde con el contenido de uno de ellos elegido arbitrariamente

#### Scenario: La respuesta del lead establece el foco

- **WHEN** el lead indica cuál alcance le interesa tras esa pregunta
- **THEN** el foco queda establecido
- **AND** el sistema responde la pregunta original sin pedir que la repita

#### Scenario: El lead pregunta otra cosa al elegir

- **WHEN** el lead responde a la desambiguación indicando un alcance y preguntando algo distinto en el mismo mensaje
- **THEN** el sistema responde la pregunta nueva
- **AND** la pregunta retenida se descarta, sin contestarse en su lugar

#### Scenario: La pregunta retenida caduca

- **WHEN** el lead vuelve a escribir después de vencido el mismo periodo que caduca el foco
- **THEN** la pregunta retenida ya no se reanuda
- **AND** el sistema atiende el mensaje nuevo como cualquier otro

#### Scenario: Pregunta que no depende del alcance

- **WHEN** un lead sin foco pregunta algo cuya respuesta es común a todos los alcances
- **THEN** el sistema responde directamente, sin preguntar

#### Scenario: Un solo alcance activo

- **WHEN** existe un único alcance activo
- **THEN** el sistema nunca pide desambiguar

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

### Requirement: Los mensajes de ruteo son configurables

Los textos que el bot usa para desambiguar y para presentar los alcances SHALL venir sembrados con un valor por defecto utilizable y ser editables desde el dashboard, como el resto de los mensajes de sistema. NO SHALL estar escritos en el código.

Su descripción SHALL documentar las variables que admiten, para que quien los edite sepa qué puede usar.

#### Scenario: Mensajes disponibles desde el primer arranque

- **WHEN** se aplica el cambio sobre una base existente
- **THEN** los mensajes de desambiguación y de presentación de alcances existen con un texto por defecto utilizable, sin que nadie tenga que redactarlos

#### Scenario: Edición del texto

- **WHEN** el administrador edita uno de esos mensajes desde el dashboard
- **THEN** el bot usa el texto editado, conservando la interpolación de sus variables

#### Scenario: Vocabulario del cliente

- **WHEN** el cliente no llama "desarrollo" a sus proyectos
- **THEN** puede cambiar esa palabra editando el mensaje, sin que ningún comportamiento dependa de ella

### Requirement: Interpolación de variables en mensajes

La sustitución de variables en los textos configurables SHALL resolverse en un único lugar, compartido por los mensajes de sistema y por las respuestas de las intenciones.

Quien pida la sustitución SHALL aportar el contexto de la conversación, y no solo las variables que introduce este cambio. Una respuesta escrita con una variable que el contexto conoce NO SHALL perderla.

#### Scenario: Variable del contexto de la conversación

- **WHEN** una respuesta de intención usa una variable que el sistema conoce del lead
- **THEN** se sustituye por su valor

#### Scenario: Variable con valor

- **WHEN** un mensaje contiene una variable para la que hay valor disponible
- **THEN** se sustituye por ese valor

#### Scenario: Variable sin valor

- **WHEN** un mensaje contiene una variable para la que no hay valor disponible
- **THEN** el mensaje se entrega sin exponer al lead la notación de la variable

#### Scenario: Mensaje sin variables

- **WHEN** un mensaje no contiene variables
- **THEN** se entrega tal cual

### Requirement: Lo que se ofrece son las ramas de primer nivel

Los alcances que el sistema enumera al lead —en el saludo y al desambiguar— SHALL ser únicamente los hijos activos de la raíz. Lo que cuelga de uno de ellos es granularidad interna de esa rama y NO SHALL presentarse como una alternativa a su propio ancestro.

Un alcance SHALL considerarse disponible solo si su fila está activa y las de todos sus ancestros también.

#### Scenario: Alcance anidado dentro de un desarrollo

- **WHEN** un desarrollo activo contiene sub-alcances activos
- **THEN** el sistema ofrece el desarrollo y no sus sub-alcances

#### Scenario: Un desarrollo con sub-alcances sigue siendo uno

- **WHEN** existe un único desarrollo activo, con sub-alcances propios
- **THEN** el sistema se comporta como con un solo alcance: no desambigua ni plantea elección

#### Scenario: Desactivar un desarrollo arrastra lo que cuelga de él

- **WHEN** se desactiva un desarrollo que contiene sub-alcances activos
- **THEN** ni el desarrollo ni sus sub-alcances se ofrecen
- **AND** el alias de un sub-alcance deja de cambiar el foco

#### Scenario: La profundidad no limita el foco ni la detección

- **WHEN** el lead nombra un sub-alcance, o pregunta algo que solo ese sub-alcance responde
- **THEN** el sistema lo resuelve desde ahí, aunque no sea una de las ramas ofrecidas

#### Scenario: Una intención repetida dentro de la misma rama no es ambigua

- **WHEN** una intención tiene contenido propio en un desarrollo y también en uno de sus sub-alcances, y en ninguna otra rama
- **THEN** el sistema no pide desambiguar, porque ambas respuestas pertenecen al mismo desarrollo

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
