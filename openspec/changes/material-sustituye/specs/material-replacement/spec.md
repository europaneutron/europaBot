## ADDED Requirements

### Requirement: Aprobar una corrida deja el bot igual al material

Al aprobarse una corrida, el bot SHALL quedar diciendo lo que dice el material de esa corrida y nada mas.

El contenido anterior comprendido en el alcance de la sustitucion SHALL retirarse, incluidas las respuestas que una persona escribio a mano. Los alcances anteriores que el material no menciona SHALL retirarse con su contenido.

No SHALL quedar ningun estado en el que una respuesta anterior y una compilada convivan activas para la misma pregunta.

#### Scenario: Lo anterior desaparece

- **WHEN** un negocio tiene contenido anterior en varias preguntas y alcances
- **AND** se compila material nuevo y se aprueba la corrida
- **THEN** ninguna respuesta anterior sigue activa
- **AND** cada pregunta que el material cubre responde con el texto compilado

#### Scenario: Un desarrollo que el material ya no menciona

- **WHEN** el arbol anterior tiene un desarrollo
- **AND** el material de la corrida no lo menciona
- **THEN** al aprobar, ese desarrollo deja de ofrecerse y su contenido deja de responder

#### Scenario: Un texto escrito a mano no sobrevive por serlo

- **WHEN** una respuesta anterior fue editada por una persona
- **AND** se aprueba una corrida que cubre esa pregunta
- **THEN** se retira igual que las demas, sin pedir una confirmacion aparte

#### Scenario: El lead no recibe dos epocas

- **WHEN** se aprueba una corrida
- **AND** un lead pregunta el precio sin haber fijado el foco
- **THEN** recibe una sola respuesta, y su texto proviene del material compilado

### Requirement: La sustitucion es una transaccion

La sustitucion SHALL aplicarse entera o no aplicarse. Si cualquier paso falla, el bot SHALL quedar exactamente como estaba antes de aprobar.

Mientras la sustitucion esta en curso, un lead que escriba NO SHALL recibir una respuesta compuesta de contenido a medio sustituir.

#### Scenario: Un fallo a media sustitucion

- **WHEN** la sustitucion falla despues de retirar parte del contenido anterior
- **THEN** el contenido anterior sigue intacto y activo
- **AND** ninguna respuesta compilada queda publicada

#### Scenario: La corrida se puede reintentar

- **WHEN** una sustitucion fallo
- **AND** se aprueba de nuevo la misma corrida
- **THEN** la sustitucion se aplica sin haber dejado residuo del intento anterior

### Requirement: Anadir es un modo explicito

El sistema SHALL ofrecer un modo "anadir" que incorpora lo que trae el material sin retirar lo existente.

Ese modo NO SHALL ser el comportamiento por omision: sustituir lo es. El modo SHALL elegirse al abrir la corrida y SHALL mostrarse en la pantalla de aprobacion, de forma que quien aprueba sepa cual de las dos cosas va a pasar.

#### Scenario: Un desarrollo nuevo en un negocio configurado

- **WHEN** se abre una corrida en modo anadir con el material de un desarrollo nuevo
- **AND** se aprueba
- **THEN** el desarrollo nuevo queda disponible
- **AND** los desarrollos anteriores y su contenido siguen intactos

#### Scenario: Por omision se sustituye

- **WHEN** se abre una corrida sin elegir modo
- **THEN** la corrida sustituye
- **AND** la pantalla de aprobacion dice que lo anterior se va a retirar

#### Scenario: El modo se ve antes de aprobar

- **WHEN** una persona llega a la pantalla de aprobacion
- **THEN** distingue si esa corrida sustituye o anade sin tener que abrir la corrida

### Requirement: Lo que la sustitucion no toca

La sustitucion SHALL limitarse al contenido que el compilador produce. NO SHALL retirar la configuracion del negocio, los datos de los leads ni su historial de conversacion.

El alcance raiz SHALL conservarse siempre: es el negocio, no un desarrollo.

#### Scenario: Los leads sobreviven

- **WHEN** se aprueba una corrida que sustituye
- **THEN** los usuarios, sus conversaciones, sus citas y su progreso quedan intactos

#### Scenario: La configuracion sobrevive

- **WHEN** se aprueba una corrida que sustituye
- **THEN** la configuracion del bot, la marca del cliente y los datos del asesor quedan intactos

#### Scenario: La raiz no se borra

- **WHEN** el material no describe el negocio sino solo sus desarrollos
- **THEN** el alcance raiz sigue existiendo tras la sustitucion

### Requirement: Un lead con el foco en algo que dejo de existir

Cuando la sustitucion retira el alcance sobre el que un lead tenia el foco, la conversacion siguiente SHALL resolverse sin error y sin responder desde el alcance retirado.

#### Scenario: El foco apuntaba a un desarrollo retirado

- **WHEN** un lead tenia el foco en un desarrollo
- **AND** una sustitucion lo retira
- **AND** el lead escribe de nuevo
- **THEN** recibe respuesta desde el negocio, no un error ni contenido del alcance retirado
