## ADDED Requirements

### Requirement: Preguntar solo donde hay duda real

El bot SHALL preguntar unicamente cuando la respuesta difiere entre alcances alcanzables, y SHALL preguntar al nivel donde empieza a diferir. Si en un nivel todos los alcances contestarian lo mismo, ese nivel no se pregunta.

#### Scenario: Dos desarrollos con direcciones distintas

- **WHEN** el lead pregunta por la ubicacion sin foco y cada desarrollo tiene una direccion propia
- **THEN** el bot pregunta de cual desarrollo y enumera los dos

#### Scenario: Un solo desarrollo

- **WHEN** el negocio tiene un solo desarrollo activo y el lead pregunta el precio sin foco
- **THEN** el bot no pregunta por desarrollo
- **AND** si dentro de ese desarrollo los modelos tienen precios distintos, contesta el rango y enumera los modelos

#### Scenario: La respuesta no depende del alcance

- **WHEN** el lead pregunta algo que tiene la misma respuesta en toda la rama alcanzable
- **THEN** el bot contesta sin preguntar

### Requirement: Contestar lo cierto antes de preguntar

Cuando exista una respuesta valida para el nivel actual, el bot SHALL darla antes de enumerar el nivel siguiente. Una pregunta sola, sin el dato que ya se puede afirmar, no es una respuesta aceptable.

#### Scenario: Rango primero, detalle despues

- **WHEN** el lead pregunta el precio con el foco en un desarrollo cuyos modelos tienen precios distintos
- **THEN** el bot afirma el rango del desarrollo
- **AND** enumera los modelos en el mismo mensaje

#### Scenario: No hay nada cierto que afirmar todavia

- **WHEN** el lead pregunta el precio sin foco y los desarrollos no comparten ningun dato de precio
- **THEN** el bot pregunta de cual sin inventar un rango que cruce las ramas

### Requirement: Enumerar desde el catalogo

Las opciones que el bot ofrece SHALL generarse desde los alcances y el contenido publicado. El sistema SHALL NOT admitir botones redactados a mano en esta capacidad.

#### Scenario: Las opciones son los alcances vivos

- **WHEN** el bot enumera desarrollos
- **THEN** cada opcion corresponde a un alcance activo y alcanzable
- **AND** un alcance retirado no aparece como opcion

#### Scenario: Una opcion lleva el dato que la distingue

- **WHEN** el bot enumera modelos que difieren en precio
- **THEN** cada opcion muestra el dato que permite elegir sin preguntar otra vez

### Requirement: El formato lo impone el transporte

El bot SHALL elegir el formato por la cantidad de opciones: hasta 3, botones de respuesta; de 4 a 10, mensaje de lista; con mas de 10, el sistema SHALL estrechar antes por un criterio del catalogo en vez de enumerar.

#### Scenario: Tres o menos

- **WHEN** hay dos desarrollos que ofrecer
- **THEN** el bot manda botones de respuesta, no texto con guiones

#### Scenario: Entre cuatro y diez

- **WHEN** hay cinco modelos que ofrecer
- **THEN** el bot manda un mensaje de lista

#### Scenario: Mas de diez

- **WHEN** el nivel a enumerar tiene mas de diez opciones
- **THEN** el bot no enumera: estrecha por un criterio disponible en el catalogo y enumera dentro de lo estrechado

### Requirement: El toque se lee como identificador

Cuando el lead responde tocando una opcion, el sistema SHALL resolver el alcance por el identificador de la opcion y SHALL NOT pasar el titulo por el matcher difuso.

#### Scenario: El lead toca una opcion

- **WHEN** llega un `button_reply` o `list_reply` de una enumeracion del bot
- **THEN** el foco queda en el alcance de esa opcion sin coincidencia difusa de por medio

#### Scenario: El lead escribe en vez de tocar

- **WHEN** el lead escribe el nombre de una de las opciones ofrecidas
- **THEN** el sistema lo resuelve contra las opciones ofrecidas antes de recurrir al matcher general

### Requirement: Una respuesta que cruza ramas nombra sus ramas

Una respuesta que reune datos de mas de una rama SHALL decir a que rama pertenece cada dato.

#### Scenario: Modelos de dos desarrollos en una lista

- **WHEN** la respuesta general de precio reune modelos de dos desarrollos
- **THEN** cada modelo aparece con el desarrollo al que pertenece

#### Scenario: Nombres repetidos en dos desarrollos

- **WHEN** dos desarrollos tienen un modelo con el mismo nombre
- **THEN** la prosa de ambos antepone el desarrollo
- **AND** una mencion ambigua sin foco previo se desambigua preguntando
