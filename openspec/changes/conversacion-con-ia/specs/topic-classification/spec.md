## ADDED Requirements

### Requirement: Clasificación en una llamada separada

En el camino con IA, la detección de temas SHALL hacerse en una llamada al modelo distinta de la que contesta, ejecutada en paralelo. Un fallo del clasificador SHALL NOT impedir ni retrasar la respuesta al lead.

#### Scenario: Las dos llamadas en paralelo

- **WHEN** llega un mensaje por el camino con IA
- **THEN** el contestador y el clasificador se ejecutan al mismo tiempo

#### Scenario: El clasificador falla

- **WHEN** la llamada del clasificador falla o supera su tiempo límite
- **THEN** el lead recibe su respuesta normalmente
- **AND** ese mensaje queda registrado sin temas y con la causa del fallo

### Requirement: Lista cerrada de temas que puede quedar vacía

El clasificador SHALL elegir temas solo de la lista de intents activos marcados como checkpoint. La salida SHALL ser estructurada y la lista de temas SHALL poder venir vacía. Un mensaje sin un tema de la lista SHALL NOT asignarse al tema más parecido.

#### Scenario: Mensaje sin tema

- **WHEN** el lead escribe "Hola", "gracias" u "ok"
- **THEN** la lista de temas viene vacía

#### Scenario: Pregunta sin palabras de los patrones

- **WHEN** el lead escribe "¿con cuánto de enganche me la llevo?"
- **THEN** el clasificador marca el tema de créditos o precio, según exista en la lista

#### Scenario: Varios temas en un mensaje

- **WHEN** el lead escribe "¿cuánto cuesta y dónde queda?"
- **THEN** el clasificador marca precio y ubicación

### Requirement: Tema fuera de la lista

Cuando el lead pregunta por algo que no está en la lista, el clasificador SHALL reportarlo como otro tema, en texto corto. Otro tema SHALL registrarse y SHALL NOT sumar al score.

#### Scenario: Pregunta por algo que no es tema

- **WHEN** el lead pregunta "¿aceptan mascotas?" y no existe ese tema
- **THEN** la lista de temas viene vacía
- **AND** queda registrado otro tema con "mascotas"

### Requirement: Evidencia textual verificada

Por cada tema, el clasificador SHALL entregar una cita textual del mensaje del lead que lo justifica. El código SHALL verificar que la cita aparezca en el mensaje, comparando sin acentos ni mayúsculas y con espacios normalizados. Un tema cuya cita no aparece SHALL descartarse. Una cita que sea solo un saludo o un afirmativo aislado SHALL descartarse.

#### Scenario: Cita inventada

- **WHEN** el clasificador marca precio con una cita que no está en el mensaje
- **THEN** el tema se descarta y el descarte queda registrado

#### Scenario: Cita irrelevante

- **WHEN** el clasificador marca un tema con la cita "Hola" o "sí"
- **THEN** el tema se descarta

#### Scenario: Cita válida con otra ortografía

- **WHEN** el mensaje dice "Aceptan INFONAVIT?" y la cita es "aceptan infonavit"
- **THEN** la cita se acepta

### Requirement: Claridad en dos niveles

Cada tema SHALL llevar una claridad: clara, si el lead pregunta por el tema o pide información de él, o dudosa, si lo menciona sin preguntar. Solo los temas claros SHALL sumar al score. Los dudosos SHALL registrarse.

#### Scenario: Pregunta directa

- **WHEN** el lead escribe "¿tienen crédito Infonavit?"
- **THEN** créditos se marca como claro y suma al score

#### Scenario: Mención sin pregunta

- **WHEN** el lead escribe "ando viendo opciones, mi esposa quiere jardín"
- **THEN** si se marca algún tema, es dudoso y no suma al score

### Requirement: Solo lo que dice el lead

El clasificador SHALL clasificar el mensaje del lead. Puede recibir los turnos anteriores para entender referencias, pero lo que el bot ofreció o dijo SHALL NOT generar un tema.

#### Scenario: El bot ofrece algo

- **WHEN** el bot escribió "¿te comparto el brochure?" y el lead contesta "sí"
- **THEN** el clasificador no marca ningún tema por ese mensaje

#### Scenario: Referencia a lo anterior

- **WHEN** el lead preguntó por Solara y luego escribe "¿y cuánto cuesta esa?"
- **THEN** el clasificador marca precio, con la cita "cuánto cuesta"

### Requirement: Desarrollo mencionado

El clasificador SHALL indicar el desarrollo al que se refiere el mensaje cuando se nombra o se deduce de los turnos anteriores, eligiendo de la lista cerrada de alcances activos, o general si no hay uno. El desarrollo SHALL guardarse como dato del lead.

#### Scenario: Desarrollo nombrado

- **WHEN** el lead escribe "¿cuánto cuesta en Altabrisa?"
- **THEN** el tema precio queda asociado a Altabrisa

#### Scenario: Sin desarrollo

- **WHEN** el lead escribe "¿manejan crédito?" sin contexto de un desarrollo
- **THEN** el tema créditos queda como general

### Requirement: Score por lead y por tema

En el camino con IA, el lead score SHALL contar cada tema una sola vez por lead, sin importar en cuántos desarrollos se pregunte. Los puntos por tema, cita y respuesta a la oferta, y los umbrales de cold, warm y hot, SHALL ser los configurados hoy en `bot_config`. La política de oferta de cita SHALL usar ese mismo conteo.

#### Scenario: El mismo tema en tres modelos

- **WHEN** el lead pregunta el precio de Aura, de Vento y de Solara
- **THEN** precio cuenta una vez para el score

#### Scenario: Temas distintos

- **WHEN** el lead pregunta de forma clara por precio, ubicación, créditos y disponibilidad
- **THEN** el score suma cuatro temas con los puntos configurados por tema

### Requirement: Señal del matcher en paralelo

Durante la prueba, el sistema SHALL registrar por cada mensaje del camino con IA también los temas que habría detectado el matcher léxico, sin que sumen al score. Con eso SHALL poder calcularse el score que habría tenido el lead con cada detector.

#### Scenario: Comparar detectores

- **WHEN** se revisa un lead atendido por el camino con IA
- **THEN** se pueden obtener los temas detectados por el clasificador y por el matcher en cada mensaje

### Requirement: Calibración antes de alimentar el score

El clasificador SHALL NOT alimentar el score hasta medir su precisión contra una muestra de mensajes reales etiquetada a mano. La precisión de los temas claros SHALL alcanzar el umbral acordado, 90% por omisión. Mientras no lo alcance, el score SHALL alimentarse con el matcher y el clasificador SHALL solo registrarse.

#### Scenario: Precisión suficiente

- **WHEN** la precisión medida de los temas claros es de 90% o más
- **THEN** el clasificador puede habilitarse como fuente del score

#### Scenario: Precisión insuficiente

- **WHEN** la precisión medida es menor al umbral
- **THEN** el score sigue usando el matcher y el clasificador solo se registra
