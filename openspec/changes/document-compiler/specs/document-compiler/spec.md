## ADDED Requirements

### Requirement: Ingesta del material del cliente

El sistema SHALL aceptar el material de un cliente en texto plano, documento y PDF, conservarlo y asociarlo a un alcance.

El material SHALL entregarse al modelo en su forma original mientras el formato lo permita, en lugar de aplanarse a texto. Aplanarlo pierde la disposición de la página y todo lo que no sea texto seleccionable.

Cuando el material no pueda leerse, el sistema SHALL decirlo, de forma distinguible de un material que sí se leyó y no contiene cierta información.

#### Scenario: Material aceptado

- **WHEN** un administrador entrega material en uno de los formatos admitidos para un alcance
- **THEN** el sistema lo conserva asociado a ese alcance y lo deja disponible para compilar

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

### Requirement: Hechos con procedencia

La compilación SHALL producir primero hechos atómicos, cada uno con la procedencia que permite verificarlo contra el material del que salió.

Un hecho sin procedencia NO SHALL conservarse.

#### Scenario: Extracción de un hecho

- **WHEN** el sistema compila material que contiene un dato concreto
- **THEN** registra ese dato como un hecho, con el material y la parte de la que proviene

#### Scenario: Verificación por un humano

- **WHEN** un administrador revisa un hecho
- **THEN** puede ver de qué material y de qué parte salió

#### Scenario: Afirmación sin respaldo

- **WHEN** la compilación produce una afirmación que no puede atribuirse a ninguna parte del material
- **THEN** esa afirmación no se conserva como hecho

#### Scenario: El mismo hecho en varias partes

- **WHEN** un mismo hecho aparece repetido en el material
- **THEN** el sistema lo conserva una sola vez

#### Scenario: El material se contradice

- **WHEN** el material afirma dos valores distintos para el mismo hecho
- **THEN** el sistema reporta la contradicción para que un humano la resuelva
- **AND** no elige uno de los dos por su cuenta

### Requirement: Catálogo de preguntas y reporte de huecos

La compilación SHALL derivar el catálogo de preguntas a cubrir y SHALL reportar cuáles quedaron sin hechos que las respondan.

Un hueco NO SHALL rellenarse con contenido generado.

#### Scenario: Pregunta cubierta

- **WHEN** el material contiene hechos que responden una pregunta del catálogo
- **THEN** esa pregunta queda marcada como cubierta

#### Scenario: Pregunta sin respaldo

- **WHEN** una pregunta del catálogo no tiene hechos que la respondan
- **THEN** el sistema la reporta como hueco
- **AND** no genera una respuesta para ella

#### Scenario: El material manda sobre el preset

- **WHEN** el material contradice lo que el preset del giro daba por supuesto
- **THEN** prevalece lo que dice el material

#### Scenario: El preset no aporta contenido

- **WHEN** el preset propone una pregunta que el material no responde
- **THEN** esa pregunta aparece como hueco y no como respuesta generada

### Requirement: Contenido propuesto y trazable

La compilación SHALL generar patrones de detección y respuestas propuestas por par de alcance e intención, y cada respuesta SHALL conservar de qué hechos depende.

#### Scenario: Respuesta propuesta

- **WHEN** una pregunta del catálogo tiene hechos que la respaldan
- **THEN** el sistema propone una respuesta para ella
- **AND** registra los hechos de los que depende

#### Scenario: Trazabilidad hasta el material

- **WHEN** un administrador revisa una respuesta propuesta
- **THEN** puede llegar desde ella hasta los hechos y desde los hechos hasta el material

#### Scenario: El catálogo de intenciones no se multiplica

- **WHEN** se compila el material de un alcance que hereda el catálogo de su ancestro
- **THEN** el sistema no duplica esas intenciones en el alcance
- **AND** produce respuestas propias donde el material difiere

### Requirement: Nada llega a un lead sin aprobación humana

El contenido propuesto NO SHALL usarse para responder a un lead antes de que un administrador lo apruebe.

La aprobación SHALL ocurrir en dos momentos: primero la forma del árbol, después el contenido.

#### Scenario: Contenido propuesto sin aprobar

- **WHEN** existe contenido propuesto para un alcance y nadie lo ha aprobado
- **THEN** el bot responde como si ese contenido no existiera

#### Scenario: Aprobación del contenido

- **WHEN** un administrador aprueba contenido propuesto
- **THEN** el bot empieza a usarlo

#### Scenario: La estructura se confirma antes del contenido

- **WHEN** la compilación propone una forma de árbol
- **THEN** el sistema pide confirmarla antes de generar contenido para ella

#### Scenario: Rechazo

- **WHEN** un administrador rechaza contenido propuesto
- **THEN** ese contenido no se usa
- **AND** el hueco correspondiente sigue reportado

### Requirement: Señales de revisión sobre lo propuesto

Cada propuesta SHALL llevar las señales que indican por qué merece atención, visibles junto al contenido que se va a aprobar.

Cuando una propuesta contenga una cifra de dinero, una fecha o una condición contractual, SHALL señalarse como dato sensible mediante una regla determinista, sin depender del criterio del modelo.

#### Scenario: Propuesta con un dato sensible

- **WHEN** una respuesta propuesta contiene un precio
- **THEN** queda señalada como dato sensible

#### Scenario: Propuesta con procedencia dudosa

- **WHEN** el compilador no pudo atribuir con confianza un hecho a una parte del material
- **THEN** la propuesta que depende de ese hecho lo indica

#### Scenario: Propuesta sin señales

- **WHEN** una propuesta no tiene ninguna señal
- **THEN** se presenta como apta para aprobar sin revisión individual

#### Scenario: Orden de la revisión

- **WHEN** un administrador abre el resultado de una compilación
- **THEN** lo que tiene señales aparece antes que lo que no

#### Scenario: Las señales no bloquean

- **WHEN** un administrador decide aprobar una propuesta señalada
- **THEN** puede hacerlo
- **AND** queda registrado que se aprobó con esa señal

### Requirement: Revisión en panel

La revisión del contenido propuesto SHALL presentarse agrupada, con la procedencia y los huecos a la vista, y SHALL permitir aprobar en bloque.

#### Scenario: Revisión de una compilación completa

- **WHEN** un administrador abre el resultado de una compilación
- **THEN** ve las respuestas agrupadas, la procedencia de cada una y los huecos detectados

#### Scenario: Aprobación en bloque

- **WHEN** un administrador aprueba un grupo de respuestas propuestas
- **THEN** todas quedan aprobadas sin revisarlas una por una

#### Scenario: Edición antes de aprobar

- **WHEN** un administrador modifica una respuesta propuesta antes de aprobarla
- **THEN** se aprueba el texto modificado
- **AND** se conserva la dependencia de los hechos que la originaron

### Requirement: Recompilar respeta lo que no cambió

Al compilar material nuevo sobre un alcance ya compilado, el sistema SHALL regenerar únicamente las respuestas que dependen de un hecho que cambió.

Las respuestas cuyos hechos no cambiaron NO SHALL modificarse, hayan sido editadas a mano o no.

#### Scenario: Hecho que cambia

- **WHEN** material nuevo cambia un hecho del que dependen algunas respuestas
- **THEN** el sistema propone regenerar esas respuestas

#### Scenario: Hecho que no cambia

- **WHEN** material nuevo deja un hecho igual que antes
- **THEN** las respuestas que dependen de él no se tocan

#### Scenario: Edición humana sobre un hecho que cambió

- **WHEN** una respuesta editada a mano depende de un hecho que cambió
- **THEN** el sistema lo advierte al administrador antes de sustituirla

#### Scenario: Hecho que desaparece

- **WHEN** material nuevo ya no respalda un hecho anterior
- **THEN** las respuestas que dependían de él quedan señaladas como sin respaldo

### Requirement: Los hechos comunes suben en el árbol

Cuando todos los hijos de un alcance comparten un hecho idéntico, el sistema SHALL atribuirlo al ancestro en lugar de repetirlo en cada uno.

#### Scenario: Hecho compartido por todos los hijos

- **WHEN** un mismo hecho aparece idéntico en todos los hijos de un alcance
- **THEN** queda atribuido al ancestro

#### Scenario: Hecho que difiere en un hijo

- **WHEN** un hecho difiere en al menos uno de los hijos
- **THEN** se conserva en cada hijo y no sube

### Requirement: Lo que el bot no supo responder es la lista de lo que falta

El sistema SHALL presentar de forma agrupada los mensajes que no produjeron una respuesta, como el material de trabajo de la siguiente compilación.

#### Scenario: Preguntas sin respuesta acumuladas

- **WHEN** varios leads preguntan algo que el bot no supo responder
- **THEN** el sistema lo presenta agrupado, indicando cuántas veces ocurrió

#### Scenario: Relación con la cobertura

- **WHEN** una pregunta recurrente sin respuesta corresponde a un hueco reportado
- **THEN** el sistema lo relaciona con ese hueco

#### Scenario: Efecto de compilar

- **WHEN** se aprueba contenido que cubre una pregunta que antes fallaba
- **THEN** deja de aparecer como pendiente

### Requirement: El runtime no cambia

Responder un mensaje NO SHALL implicar ninguna llamada a un modelo de lenguaje ni ningún acceso al material del cliente.

#### Scenario: Respuesta a un lead

- **WHEN** el bot responde un mensaje sobre contenido aprobado
- **THEN** lo resuelve con el mismo mecanismo que antes de este cambio

#### Scenario: Sin material compilado

- **WHEN** ningún alcance tiene material compilado
- **THEN** el comportamiento observable del bot es idéntico al anterior a este cambio

#### Scenario: Fallo del proveedor externo

- **WHEN** el servicio que compila no está disponible
- **THEN** el bot sigue respondiendo con el contenido ya aprobado

## MODIFIED Requirements

### Requirement: Composición de respuestas por bloques

El editor SHALL permitir componer una respuesta como una secuencia ordenada de bloques de texto y multimedia, con una pausa configurable entre ellos.

Una respuesta SHALL indicar además su origen —propuesta por el compilador o escrita a mano— y, cuando venga del compilador, los hechos de los que depende.

#### Scenario: Composición de una secuencia

- **WHEN** un administrador compone una respuesta con varios bloques
- **THEN** el bot los envía en ese orden, con las pausas configuradas

#### Scenario: Origen visible

- **WHEN** un administrador abre una respuesta propuesta por el compilador
- **THEN** ve que fue propuesta y de qué hechos depende

#### Scenario: Respuesta escrita a mano

- **WHEN** un administrador crea una respuesta desde cero
- **THEN** queda marcada como escrita a mano y sin dependencia de hechos
