## ADDED Requirements

### Requirement: El usuario no ve el modelo del sistema

Ninguna pantalla del recorrido ni del panel de revisión SHALL mostrar los términos con los que el sistema describe su propia construcción: alcance, nodo, árbol, aplanar, hecho, procedencia, etapa, ejecución o compilación.

La interfaz SHALL usar la palabra con la que el cliente nombra sus proyectos.

#### Scenario: Vocabulario propio del cliente

- **WHEN** el cliente indica cómo llama a sus proyectos
- **THEN** la interfaz usa esa palabra donde antes decía el término interno

#### Scenario: Textos del sistema

- **WHEN** un mensaje sembrado menciona el tipo de proyecto
- **THEN** usa la palabra del cliente

#### Scenario: Ausencia de términos internos

- **WHEN** el cliente recorre el alta y la revisión completas
- **THEN** no encuentra ninguno de los términos con los que el sistema se describe a sí mismo

### Requirement: Alta de un proyecto desde la interfaz

El recorrido SHALL permitir dar de alta un proyecto y sus partes sin escribir SQL, y SHALL registrar los nombres con los que un lead puede referirse a cada uno.

#### Scenario: Primer proyecto

- **WHEN** un cliente completa el alta de su primer proyecto
- **THEN** el proyecto queda disponible para recibir material y responder

#### Scenario: Segundo proyecto

- **WHEN** un cliente da de alta un proyecto adicional
- **THEN** convive con el anterior sin alterar su contenido ni su configuración

#### Scenario: Nombres reconocibles

- **WHEN** se da de alta un proyecto con un nombre
- **THEN** el sistema puede reconocerlo cuando un lead lo mencione

### Requirement: La estructura se propone desde el material y el cliente la confirma

El recorrido SHALL recibir el material antes de pedir la estructura, y SHALL presentar la estructura que el compilador dedujo del material para que el cliente la confirme o la corrija.

El cliente NO SHALL tener que declarar su estructura antes de entregar material, salvo como alternativa explícita cuando no lo tenga.

La estructura confirmada SHALL ser la que crea los proyectos y sus partes.

#### Scenario: Estructura deducida del material

- **WHEN** el compilador termina de leer el material
- **THEN** el sistema presenta los nombres que encontró y cómo se agrupan
- **AND** pide confirmarlo antes de generar contenido

#### Scenario: El cliente confirma

- **WHEN** el cliente confirma la estructura propuesta
- **THEN** los proyectos y sus partes quedan dados de alta con esos nombres

#### Scenario: El cliente la corrige

- **WHEN** el cliente indica que sus opciones no se venden por separado
- **THEN** el sistema las agrupa en un solo proyecto

#### Scenario: Una parte que el cliente no esperaba

- **WHEN** el material contiene una opción que el cliente no habría mencionado
- **THEN** aparece en la propuesta y el cliente decide si la incluye
- **AND** su contenido no se atribuye a otro proyecto sin avisar

#### Scenario: Sin material

- **WHEN** el cliente todavía no tiene material que entregar
- **THEN** puede declarar su estructura a mano y continuar

#### Scenario: La profundidad sale del material

- **WHEN** el material distingue opciones dentro de un proyecto
- **THEN** la propuesta las presenta como partes de ese proyecto
- **AND** la pregunta sobre cómo ocurre una visita se hace sobre esos nombres concretos

### Requirement: La identidad del negocio

El recorrido SHALL recoger el nombre del negocio del cliente, proponiéndolo desde el material cuando pueda deducirlo, y SHALL distinguirlo de la palabra con la que el cliente nombra sus proyectos.

El nombre del negocio SHALL quedar disponible como variable para los mensajes configurables.

#### Scenario: Nombre propuesto desde el material

- **WHEN** el material permite deducir el nombre del negocio
- **THEN** el sistema lo propone y el cliente lo confirma o lo corrige

#### Scenario: Nombre que el material no dice

- **WHEN** el material solo menciona los proyectos y no el negocio que los vende
- **THEN** el sistema lo pregunta

#### Scenario: Negocio y proyecto son cosas distintas

- **WHEN** el cliente tiene un solo proyecto
- **THEN** el nombre del negocio y el del proyecto se conservan por separado

#### Scenario: El bot se presenta

- **WHEN** el bot saluda a un lead
- **THEN** se presenta con el nombre del negocio y no con el de uno de sus proyectos

### Requirement: El saludo se compone sin pisar el existente

Cuando el cliente no tenga un saludo propio, el sistema SHALL componerlo con la identidad del negocio y los proyectos disponibles.

Un saludo ya redactado NO SHALL modificarse sin que el cliente lo vea y lo confirme.

#### Scenario: Cliente sin saludo propio

- **WHEN** un cliente termina el recorrido y no tenía un saludo redactado
- **THEN** su bot saluda con el nombre del negocio y lo que hay disponible

#### Scenario: Cliente con saludo propio

- **WHEN** un cliente ya tiene un saludo redactado
- **THEN** el sistema no lo cambia por su cuenta
- **AND** puede ofrecerle el compuesto mostrándoselo antes

#### Scenario: Alta de un proyecto nuevo

- **WHEN** se da de alta un proyecto y el saludo es compuesto
- **THEN** aparece en el saludo sin editar ningún texto

### Requirement: Las preguntas hablan del negocio, no de la estructura

Las decisiones que determinan la forma del catálogo SHALL preguntarse a través de cómo vende el cliente, y NO SHALL presentarse como decisiones de estructura.

#### Scenario: Profundidad del catálogo

- **WHEN** el sistema necesita saber si el catálogo baja al detalle de cada modelo
- **THEN** lo pregunta a través de cómo ocurre una visita en su negocio
- **AND** no menciona niveles, jerarquías ni estructura

#### Scenario: Preguntas sobre datos ya conocidos

- **WHEN** el sistema ya conoce los nombres de los proyectos o modelos del cliente
- **THEN** los usa en la pregunta en lugar de hablar en general

### Requirement: El recorrido se completa siempre

Toda pregunta SHALL tener un valor por defecto utilizable y una opción para no responder. El recorrido SHALL poder completarse respondiendo "no estoy seguro" en todas.

#### Scenario: Cliente que no sabe qué responder

- **WHEN** un cliente responde que no está seguro en todas las preguntas
- **THEN** el recorrido termina y el bot queda en un estado razonable

#### Scenario: Cambio posterior

- **WHEN** un cliente quiere cambiar algo que respondió durante el recorrido
- **THEN** puede hacerlo después sin repetir el recorrido

#### Scenario: Recorrido interrumpido

- **WHEN** un cliente abandona el recorrido a la mitad y vuelve más tarde
- **THEN** continúa donde lo dejó, sin repetir lo ya contestado

### Requirement: El tono se elige viendo ejemplos

La elección del tono SHALL presentarse como mensajes de muestra renderizados con los datos del propio cliente. NO SHALL pedirse como una descripción escrita.

#### Scenario: Elección sobre muestras

- **WHEN** el cliente llega al paso del tono y su material ya fue leído
- **THEN** ve varias muestras del mismo mensaje con sus propios datos y elige una

#### Scenario: Efecto sobre lo que se redacta

- **WHEN** el cliente elige un tono
- **THEN** las respuestas que se propongan después siguen ese tono

#### Scenario: Sin material todavía

- **WHEN** el cliente llega al paso del tono sin material leído
- **THEN** las muestras usan datos de ejemplo y la elección sigue siendo posible

### Requirement: Solo se ofrece lo que el sistema sabe hacer

El recorrido NO SHALL presentar como elección aquello que tiene una sola respuesta posible en el producto.

#### Scenario: Objetivo de conversión

- **WHEN** el recorrido llega a lo que el bot debe conseguir
- **THEN** lo afirma en lugar de preguntarlo, porque solo existe uno

### Requirement: La compilación no se pilota desde la interfaz

Al entregar material, el sistema SHALL iniciar y hacer avanzar la compilación por su cuenta hasta la siguiente decisión humana. La interfaz NO SHALL ofrecer controles para avanzarla.

#### Scenario: Material entregado

- **WHEN** el cliente entrega su material
- **THEN** el sistema empieza a procesarlo sin ninguna acción adicional

#### Scenario: Estado visible

- **WHEN** el sistema está procesando material
- **THEN** el cliente ve que está trabajando y qué falta, sin conocer las etapas internas
- **AND** sabe cuánto puede tardar y que no debe cerrar la pantalla

#### Scenario: Vuelta después de cerrar

- **WHEN** un cliente cierra la pantalla con el procesamiento a medias y vuelve más tarde
- **THEN** el procesamiento continúa desde donde quedó, entre por donde entre
- **AND** no repite el trabajo ya hecho

#### Scenario: Fallo del proveedor

- **WHEN** el procesamiento falla
- **THEN** el cliente lo ve, en sus términos, y puede volver a intentarlo

#### Scenario: Espera de una decisión

- **WHEN** el procesamiento llega a un punto que requiere aprobación
- **THEN** el sistema lo pide en lugar de continuar

### Requirement: El chat decide, el panel revisa

El recorrido SHALL terminar entregando la revisión del contenido a un panel, y NO SHALL presentar las respuestas propuestas una por una dentro de la conversación.

#### Scenario: Fin del recorrido

- **WHEN** el cliente termina el recorrido y hay contenido propuesto
- **THEN** el sistema lo lleva al panel de revisión

#### Scenario: Revisión agrupada

- **WHEN** el cliente revisa el contenido propuesto
- **THEN** lo ve agrupado, con lo que necesita atención primero y la posibilidad de aprobar en bloque

## MODIFIED Requirements

### Requirement: Revisión en panel

La revisión del contenido propuesto SHALL presentarse agrupada, con la procedencia y los huecos a la vista, y SHALL permitir aprobar en bloque.

El panel SHALL limitarse a la revisión: NO SHALL ofrecer selección de alcance, avance de etapas, ni ningún término con el que el sistema se describe a sí mismo.

#### Scenario: Revisión de una compilación completa

- **WHEN** un administrador abre el resultado de una compilación
- **THEN** ve las respuestas agrupadas, de dónde salió cada dato y lo que quedó sin cubrir

#### Scenario: Aprobación en bloque

- **WHEN** un administrador aprueba un grupo de respuestas propuestas
- **THEN** todas quedan aprobadas sin revisarlas una por una

#### Scenario: Edición antes de aprobar

- **WHEN** un administrador modifica una respuesta propuesta antes de aprobarla
- **THEN** se aprueba el texto modificado
- **AND** se conserva la dependencia de los datos que la originaron

#### Scenario: El panel no opera el proceso

- **WHEN** un administrador abre el panel
- **THEN** no encuentra forma de avanzar el procesamiento ni de elegir contra qué proyecto trabaja el sistema

### Requirement: Contenido propuesto y trazable

La compilación SHALL generar patrones de detección y respuestas propuestas por par de alcance e intención, y cada respuesta SHALL conservar de qué hechos depende.

Las respuestas SHALL redactarse con el tono y el vocabulario que el cliente eligió.

#### Scenario: Respuesta propuesta

- **WHEN** una pregunta del catálogo tiene hechos que la respaldan
- **THEN** el sistema propone una respuesta para ella
- **AND** registra los hechos de los que depende

#### Scenario: Trazabilidad hasta el material

- **WHEN** un administrador revisa una respuesta propuesta
- **THEN** puede llegar desde ella hasta los datos y desde los datos hasta el documento

#### Scenario: El catálogo de intenciones no se multiplica

- **WHEN** se compila el material de un alcance que hereda el catálogo de su ancestro
- **THEN** el sistema no duplica esas intenciones en el alcance
- **AND** produce respuestas propias donde el material difiere

#### Scenario: Tono elegido por el cliente

- **WHEN** el cliente eligió un tono durante el recorrido
- **THEN** las respuestas propuestas lo siguen
