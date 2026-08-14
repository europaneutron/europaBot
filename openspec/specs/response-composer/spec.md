# response-composer Specification

## Purpose
TBD - created by archiving change fragment-editor. Update Purpose after archive.
## Requirements
### Requirement: Composición de respuestas por bloques

El editor de respuestas SHALL representar cada respuesta como una secuencia ordenada de bloques, donde cada bloque corresponde a un fragmento de `MessageFragment` y se envía como un mensaje independiente de WhatsApp.

#### Scenario: Crear una respuesta con varios bloques

- **WHEN** el administrador agrega un bloque de texto, dos bloques de imagen y un bloque de documento
- **THEN** el editor muestra los cuatro bloques en el orden en que fueron agregados
- **AND** al guardar, la respuesta se persiste con `response_type` igual a `fragmented` y `message_text` conteniendo un objeto con el arreglo `fragments` en ese mismo orden

#### Scenario: Abrir una respuesta simple existente

- **WHEN** el administrador abre para editar una respuesta con `response_type` igual a `simple`
- **THEN** el editor la presenta como bloques equivalentes: un bloque de texto con el contenido de `message_text`, y un bloque de media si `media_url` tiene valor

#### Scenario: Rechazar una respuesta sin bloques

- **WHEN** el administrador intenta guardar una respuesta cuya lista de bloques está vacía
- **THEN** el sistema impide el guardado e informa que la respuesta debe tener al menos un bloque

### Requirement: Reordenamiento de bloques

El editor SHALL permitir cambiar el orden de los bloques de una respuesta mediante arrastre, y el orden visual SHALL corresponder siempre al orden de envío.

#### Scenario: Mover un bloque

- **WHEN** el administrador arrastra un bloque a otra posición de la secuencia
- **THEN** el editor actualiza el orden mostrado
- **AND** al guardar, el arreglo `fragments` refleja el nuevo orden

#### Scenario: Reordenar con teclado

- **WHEN** el administrador enfoca el control de arrastre de un bloque y usa las teclas de dirección
- **THEN** el bloque cambia de posición sin requerir uso del ratón

### Requirement: Adjuntar múltiples archivos

El editor SHALL permitir adjuntar varios archivos en una sola operación, reutilizando `MediaLibrary` y el bucket `bot-media`, sin exigir que el administrador escriba o pegue URLs manualmente.

#### Scenario: Seleccionar varios archivos de la biblioteca

- **WHEN** el administrador abre la biblioteca de medios y selecciona tres imágenes
- **THEN** el editor agrega tres bloques de imagen a la secuencia, uno por archivo, en el orden de selección

#### Scenario: Subir varios archivos a la vez

- **WHEN** el administrador arrastra varios archivos hacia el editor
- **THEN** el sistema los sube al bucket `bot-media` y agrega un bloque por cada archivo subido
- **AND** el tipo de bloque se deriva del tipo MIME del archivo

#### Scenario: Archivo de tipo no permitido

- **WHEN** el administrador intenta subir un archivo cuyo tipo MIME no está permitido por el bucket
- **THEN** el sistema rechaza ese archivo e informa qué tipos son admitidos
- **AND** los archivos válidos de la misma operación sí se agregan

### Requirement: Control de pausas entre bloques

El editor SHALL permitir configurar el `delay` en milisegundos que precede a cada bloque eligiendo entre valores predefinidos, y NO SHALL exponer un campo numérico libre.

Los valores ofrecidos son: sin pausa (`0`), corta (`800`), media (`1200`) y larga (`2000`). El valor por defecto es media (`1200`).

#### Scenario: Ajustar la pausa de un bloque

- **WHEN** el administrador selecciona una pausa sugerida para un bloque
- **THEN** el valor correspondiente en milisegundos se asigna al campo `delay` de ese fragmento

#### Scenario: Pausa por defecto en bloques nuevos

- **WHEN** el administrador agrega un bloque nuevo
- **THEN** el bloque recibe un `delay` de `1200` milisegundos sin intervención del administrador

#### Scenario: No se admiten pausas arbitrarias

- **WHEN** el administrador ajusta la pausa de un bloque
- **THEN** solo puede elegir entre los valores predefinidos, sin posibilidad de escribir un número mayor a `2000`

### Requirement: Presupuesto de tiempo de envío

Como el envío de fragmentos ocurre de forma secuencial y bloqueante dentro del webhook, el editor SHALL acotar y hacer visible el tiempo total que tarda una respuesta en enviarse.

Una respuesta SHALL tener como máximo seis bloques.

#### Scenario: Mostrar el tiempo estimado

- **WHEN** la respuesta tiene uno o más bloques
- **THEN** el editor muestra el tiempo estimado de envío, calculado como la suma de las pausas más una estimación de la ida y vuelta a la API de Meta por cada bloque

#### Scenario: Advertir cuando la secuencia es larga

- **WHEN** el tiempo estimado de envío supera los diez segundos
- **THEN** el editor muestra una advertencia que explica el riesgo de que Meta reintente la entrega y el lead reciba mensajes duplicados

#### Scenario: Impedir exceder el máximo de bloques

- **WHEN** la respuesta ya tiene seis bloques
- **THEN** el editor impide agregar otro bloque e informa el motivo del límite

### Requirement: Vista previa de la secuencia

El editor SHALL mostrar una vista previa que represente cómo recibirá el lead la respuesta en WhatsApp, respetando el orden de los bloques y diferenciando cada mensaje.

#### Scenario: Previsualizar una secuencia

- **WHEN** la respuesta tiene bloques de texto, imagen y documento
- **THEN** la vista previa muestra cada bloque como una burbuja de mensaje independiente en el orden de envío
- **AND** las imágenes se muestran renderizadas y los documentos con su nombre de archivo

#### Scenario: La vista previa refleja los cambios

- **WHEN** el administrador edita, agrega, elimina o reordena un bloque
- **THEN** la vista previa se actualiza para reflejar el estado actual de la secuencia

### Requirement: Persistencia retrocompatible

El sistema SHALL escribir las respuestas editadas en formato `fragmented`, y SHALL continuar interpretando correctamente las respuestas existentes en formato `simple` y las que usan la columna `media_url`.

#### Scenario: Guardar una respuesta editada

- **WHEN** el administrador guarda una respuesta desde el editor de bloques
- **THEN** la respuesta se persiste con `response_type` igual a `fragmented`
- **AND** el registro cumple el constraint `message_text_or_media_required`

#### Scenario: El runtime lee respuestas existentes sin cambios

- **WHEN** el bot resuelve una respuesta creada antes de este cambio, en formato `simple` o con `media_url`
- **THEN** la envía con el mismo comportamiento que antes del cambio

#### Scenario: Convertir una respuesta legacy al editarla

- **WHEN** el administrador abre una respuesta `simple` con `media_url` y la guarda sin modificar nada
- **THEN** la respuesta queda persistida en formato `fragmented` con los bloques equivalentes
- **AND** el mensaje que recibe el lead es equivalente al que recibía antes

### Requirement: Ninguna acción de composición guarda la respuesta

Solo la acción explícita de guardar SHALL persistir la respuesta. Ninguna interacción de
composición —abrir o cerrar la biblioteca, filtrar, subir archivos, agregar, mover o eliminar
bloques— SHALL guardar ni cerrar el editor.

#### Scenario: Filtrar dentro de la biblioteca

- **WHEN** el administrador abre la biblioteca de medios y usa cualquiera de sus controles de filtrado, subida o cierre
- **THEN** la respuesta no se guarda y el editor permanece abierto con su contenido intacto

#### Scenario: Componer sin guardar

- **WHEN** el administrador agrega, edita, reordena o elimina bloques
- **THEN** los cambios permanecen sin persistir hasta que use la acción de guardar

### Requirement: Coherencia del filtrado en la biblioteca

Cuando se solicita un tipo de archivo, la biblioteca SHALL mostrar los archivos de ese tipo
como un único criterio de filtrado, sin exigir al administrador que además elija una
ubicación para encontrarlos.

#### Scenario: Solicitar un tipo de archivo

- **WHEN** el administrador abre la biblioteca para agregar un bloque de un tipo determinado
- **THEN** ve los archivos disponibles de ese tipo, sin combinaciones de filtros que produzcan un resultado vacío por contradecirse entre sí

#### Scenario: Archivo subido que el filtro oculta

- **WHEN** el administrador sube un archivo que el filtro activo no muestra
- **THEN** el archivo no queda seleccionado, para que no se agregue un bloque que no puede ver ni quitar

### Requirement: Integridad de los datos mostrados

El editor SHALL preservar los valores existentes de una respuesta y los nombres de archivo
tal como fueron cargados.

#### Scenario: Pausa fuera del conjunto ofrecido

- **WHEN** el administrador abre una respuesta cuyo fragmento tiene una pausa que no coincide con los valores predefinidos
- **THEN** el control muestra el valor vigente en lugar de aparecer vacío
- **AND** el valor se conserva si el administrador no lo modifica

#### Scenario: Nombre de archivo con dígitos iniciales

- **WHEN** un archivo cuyo nombre comienza con dígitos se agrega como bloque de documento
- **THEN** el nombre que recibe el lead conserva esos dígitos

### Requirement: Tolerancia a datos existentes malformados

El editor SHALL abrir cualquier respuesta existente sin interrumpir la pantalla, aun cuando
sus datos no tengan el formato esperado.

#### Scenario: URL de media malformada

- **WHEN** el administrador abre una respuesta cuya `media_url` no puede decodificarse
- **THEN** la pantalla sigue funcionando y la respuesta se presenta de la mejor forma posible, sin propagar el error

### Requirement: Validación por bloque

El editor SHALL validar el contenido de cada bloque según su tipo e indicar el bloque específico que presenta el problema, en lugar de aplicar una única regla global a toda la respuesta.

#### Scenario: Bloque de texto vacío

- **WHEN** el administrador intenta guardar con un bloque de texto sin contenido
- **THEN** el sistema impide el guardado y señala ese bloque como inválido

#### Scenario: Bloque de media sin archivo

- **WHEN** un bloque de imagen, video o documento no tiene archivo asociado
- **THEN** el sistema impide el guardado y señala ese bloque como inválido

#### Scenario: Respuesta compuesta solo por media

- **WHEN** la respuesta contiene únicamente bloques de imagen o documento, sin bloques de texto
- **THEN** el sistema permite guardarla

