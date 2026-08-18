## MODIFIED Requirements

### Requirement: Desambiguación cuando la pregunta depende del alcance

Cuando el sistema no puede determinar el alcance y la intención detectada tiene contenido distinto en varios alcances activos, SHALL pedir al lead que indique de cuál se trata en lugar de responder con un contenido arbitrario.

La condición SHALL derivarse de los datos: una intención depende del alcance cuando varios alcances activos definen contenido propio para ella. No requiere marcarla como tal.

La pregunta SHALL enumerar los alcances candidatos en el formato que corresponda a su cantidad, y SHALL apuntar al nivel donde las respuestas empiezan a diferir, no siempre al primer nivel.

Una intención que solo existe en las ramas SHALL detectarse igual sin foco: la ausencia de contenido en la raíz es motivo para desambiguar, nunca para caer al fallback.

#### Scenario: Pregunta dependiente del alcance sin foco

- **WHEN** un lead sin foco pregunta algo cuya respuesta está definida por separado en varios alcances activos
- **THEN** el sistema le pide que indique de cuál desarrollo se trata, enumerando los candidatos
- **AND** no responde con el contenido de uno de ellos elegido arbitrariamente

#### Scenario: La pregunta solo tiene respuesta en las ramas

- **WHEN** un lead sin foco pregunta la ubicación y solo los desarrollos tienen dirección, no la raíz
- **THEN** el sistema detecta la intención y desambigua
- **AND** no cae al fallback

#### Scenario: La duda está por debajo del primer nivel

- **WHEN** existe un solo desarrollo activo y sus modelos tienen precios distintos
- **THEN** el sistema no pregunta por desarrollo
- **AND** enumera los modelos, que es donde empieza la diferencia

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

- **WHEN** existe un único alcance activo y ninguno de sus hijos define contenido propio para la pregunta
- **THEN** el sistema nunca pide desambiguar

### Requirement: Cambio de foco por mención

Cuando el lead nombra un alcance mediante uno de sus alias, el sistema SHALL cambiar el foco a ese alcance, sin importar su profundidad en el árbol.

Un mensaje que solo nombra un alcance —sin preguntar nada— SHALL equivaler a repetir ahí la última pregunta del lead. Si no hay ninguna, el sistema SHALL presentar el alcance y ofrecer su nivel siguiente.

#### Scenario: El lead nombra un desarrollo

- **WHEN** el mensaje contiene un alias de un alcance activo distinto del foco actual
- **THEN** el foco cambia a ese alcance
- **AND** la respuesta se resuelve desde ahí

#### Scenario: Mencionar un alcance repite ahí la última pregunta

- **WHEN** el lead pregunta el precio, el bot desambigua y el lead escribe "me interesa Europa"
- **THEN** el foco queda en Europa
- **AND** el bot responde el precio de Europa sin pedir que repita la pregunta

#### Scenario: Mención a secas sin pregunta previa

- **WHEN** el lead escribe solo el nombre de un modelo y no ha preguntado nada antes
- **THEN** el bot presenta ese modelo con lo que el material dice de él
- **AND** ofrece el nivel siguiente si lo hay

#### Scenario: Mención de un hermano

- **WHEN** el foco está en un modelo y el lead escribe "y el de Cala"
- **THEN** el foco pasa a Cala
- **AND** el bot repite ahí la última pregunta contestada

#### Scenario: Mención de un alcance profundo

- **WHEN** el lead nombra directamente un alcance que no es hijo inmediato de la raíz
- **THEN** el foco salta a ese alcance sin exigir que antes se indiquen sus ancestros

#### Scenario: El foco anterior queda registrado

- **WHEN** el foco cambia de un alcance a otro
- **THEN** el sistema conserva cuál era el foco previo

#### Scenario: Alias de un alcance inactivo

- **WHEN** el mensaje contiene un alias de un alcance que no está activo
- **THEN** el foco no cambia

## ADDED Requirements

### Requirement: Saludar suelta el foco

Un saludo SHALL soltar el foco de la conversación y la pregunta retenida. Es la salida del lead de una rama sin tener que nombrar otra.

#### Scenario: El lead saluda a mitad de conversación

- **WHEN** el foco está en un modelo y el lead escribe "hola"
- **THEN** el foco queda suelto
- **AND** el bot saluda y ofrece los desarrollos disponibles

#### Scenario: Después del saludo se vuelve a preguntar

- **WHEN** el lead saluda y a continuación pregunta el precio
- **THEN** el sistema desambigua como con cualquier lead sin foco
- **AND** no responde desde el foco anterior

### Requirement: Pedir otro es pedir los hermanos

Con el foco puesto, un mensaje que pide alternativas —"otro", "¿qué más tienen?", "¿y los demás?"— SHALL enumerar los hermanos del alcance en foco, no el catálogo entero.

#### Scenario: Pedir otro modelo

- **WHEN** el foco está en un modelo de un desarrollo y el lead escribe "¿qué más tienen?"
- **THEN** el bot enumera los demás modelos de ese desarrollo
- **AND** no incluye modelos de otro desarrollo

#### Scenario: Pedir otro sin hermanos

- **WHEN** el alcance en foco no tiene hermanos
- **THEN** el bot lo dice y sube un nivel para ofrecer lo que sí hay

#### Scenario: Pedir otro sin foco

- **WHEN** el lead pide alternativas y no hay foco
- **THEN** el bot enumera el primer nivel
