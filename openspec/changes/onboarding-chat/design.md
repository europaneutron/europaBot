## Context

Es el último cambio de la serie y el que la vuelve un producto. Todo lo anterior es infraestructura que hoy solo se opera con SQL y con un panel que describe su propia implementación.

Lo que ya existe y este cambio consume:

- **El árbol**: `scopes` con `create` y `reparent` en `scope.repository.ts`. Nadie los llama desde una pantalla.
- **El ruteo**: alias por alcance y anuncios, en `scope_aliases` y `scope_ads`. Se siembran a mano.
- **El compilador**: `documentCompilerService.runNextStage`, hoy invocado desde un botón.
- **Los mensajes de sistema**: sembrados y editables desde Ajustes, con sus variables documentadas.

### Qué se decide dónde

| Decisión | Quién la toma | Cómo se pregunta |
|---|---|---|
| Cómo llama el cliente a sus proyectos | el cliente | directamente, es su palabra |
| Cuántos proyectos y cómo se llaman | el cliente | por su nombre real |
| Si el catálogo baja a modelos | el cliente | por cómo vende, nunca por estructura |
| Tono del bot | el cliente | eligiendo entre ejemplos renderizados |
| Qué preguntas cubre el bot | el material y el preset | no se pregunta |
| Cuándo se ofrece la cita | el runtime | no se pregunta |
| Qué modelo de IA se usa | el equipo del producto | no se pregunta |

## Goals / Non-Goals

**Goals:**

- Que dar de alta un cliente no requiera SQL.
- Que el usuario nunca vea el modelo del sistema, solo su propio negocio.
- Que la compilación ocurra sin que nadie la pilote.
- Que el tono se elija viendo el resultado.
- Que se llegue al final aunque se conteste "no estoy seguro" a todo.
- Que el panel del compilador quede reducido a lo que sí es una decisión humana.

**Non-Goals:**

- Objetivos de conversión distintos de la cita.
- Autoservicio de registro.
- Un editor completo del árbol.
- Cambiar cómo compila el compilador.

## Decisions

### El usuario nunca ve el modelo del sistema

Es el principio del que cuelga todo lo demás, y el que se incumplió en el panel del compilador.

Palabras como *alcance*, *nodo*, *árbol*, *hecho*, *procedencia*, *etapa* o *aplanar* describen cómo está construido esto. No significan nada para quien vende casas, y verlas produce el efecto contrario al que se busca: la sensación de estar operando una máquina ajena en lugar de configurar su negocio.

La regla operativa es dura: **si una palabra de la interfaz no existiría en la conversación de un vendedor con su cliente, no va.**

### El vocabulario lo pone el cliente

Un desarrollo, un fraccionamiento, una plaza comercial y una clínica son la misma cosa en el modelo y cuatro palabras distintas para quien las vende. Se le pregunta cómo llama a los suyos y la interfaz usa esa palabra en todas partes, incluidos los mensajes de sistema que ya están sembrados.

No es cosmético: es lo que hace que el producto no parezca hecho para inmobiliarias cuando se venda a otro giro.

### Nunca preguntar en abstracto lo que se puede preguntar sobre sus datos

"¿Quieres desglosar por modelo?" obliga al usuario a razonar sobre una estructura. "Cuando alguien te pide una visita, ¿ya viene decidido por un modelo o le muestras los dos?" pregunta por algo que hace todos los días.

La respuesta determina la profundidad del catálogo, que es la regla que `scope-tree` ya fijó: **el árbol es tan profundo como granular sea el evento de conversión**. El usuario no se entera de que decidió eso.

Y en cuanto el sistema conoce sus datos, deja de hablar en general: dice "Toscana y Milano", no "tus modelos".

### Un chat en la forma, no en la libertad

Botones, no campo abierto. Es determinista, sin latencia y sin nada que interpretar mal. El campo libre existe como escotilla para lo que no encaje, no como el camino normal.

La forma de chat se elige porque hace las preguntas de una en una y da sensación de avance, no porque haga falta un modelo de lenguaje para conducirlo.

*Alternativa descartada:* un asistente conversacional libre. Introduce latencia, varianza e interpretación errónea en el momento en que el cliente decide si el producto le sirve.

### Toda pregunta necesita un default defendible

Y una salida tipo "no estoy seguro". Se llega al final contestando eso a todo, con un bot razonable, porque un onboarding donde alguien se traba es un cliente perdido antes de empezar.

Lo que no se sepa se puede cambiar después; lo que bloquee no se recupera.

### El tono se elige viendo, no describiendo

Un campo que diga "describe el tono de tu marca" produce basura: nadie sabe describir un tono, y lo que escriba no se parecerá a lo que salga.

Se muestran tres mensajes de muestra renderizados **con sus propios datos**, ya extraídos del material, y elige el que suena a su marca. La decisión se toma sobre el resultado, que es lo único que va a ver su cliente.

### Solo se ofrece lo que el runtime sabe hacer

Hoy hay un único objetivo de conversión: la cita. Preguntar por el objetivo sugeriría que hay opciones, y no las hay: abstraerlo exige volver los flujos datos —estados, campos requeridos, acción al completar— y es un proyecto aparte.

No se pregunta, se afirma: "tu bot va a agendar visitas".

### La compilación no se pilota

Las etapas existen porque un brochure no cabe en el tiempo de una petición. Es una restricción de infraestructura y no una decisión del usuario, así que no puede haber un botón para avanzarlas.

Al entregar el material, la compilación arranca y avanza sola hasta la primera compuerta. El usuario ve que está trabajando y qué falta, no qué etapa corre.

### El chat sirve para decisiones, no para volumen

Revisar veinticuatro respuestas en burbujas de conversación es horrible. El último paso entrega a un panel con la lista agrupada, la procedencia al lado, las señales de revisión y aprobar en bloque.

Ahí es donde el chat termina y empieza la herramienta, y es la razón por la que el panel debe existir —pero solo para eso—.

### El panel del compilador se reduce a la segunda compuerta

Corrige lo que quedó mal en `document-compiler`. El panel conserva: qué propuso el sistema, de dónde salió cada dato, aprobar o rechazar, y qué falta por cubrir.

Deja de tener: selector de alcance, botón de etapa, y toda palabra que nombre nuestras tablas. Lo que hoy dice "hechos y procedencia" pasa a decir de dónde salió el dato; lo que dice "el original queda conservado" desaparece, porque al usuario le basta ver el nombre de su documento.

### Flexible en interpretar, rígido en afirmar

El principio transversal, aplicado aquí: el chat no interpreta nada. Es determinista de principio a fin.

Lo único que un modelo de lenguaje aporta en este recorrido es inferir el giro a partir del material para proponer el preset, y esa inferencia la confirma un humano antes de usarse.

## Risks / Trade-offs

- **Un recorrido guiado envejece mal** → Cada capacidad nueva quiere un paso más, y a los quince pasos deja de ser un onboarding. Siete es el límite que se acepta; lo que no quepa va a Ajustes.

- **El vocabulario del cliente aparece en textos ya sembrados** → Sustituirlo en los mensajes de sistema es fácil de olvidar en los que se agreguen después, y una interfaz medio traducida es peor que una consistente.

- **El tono elegido se aplica a contenido que aún no existe** → Se elige sobre tres muestras y se aplica a veinticuatro respuestas. Puede no gustar cuando estén todas; el panel de revisión es donde eso se corrige.

- **Un cliente que se traba a la mitad** → El recorrido debe poder retomarse. Perder lo contestado obliga a repetirlo y multiplica el abandono.

- **La compilación automática oculta sus fallos** → Si nadie la pilota, un fallo del proveedor puede quedarse en silencio. El estado tiene que ser visible sin que el usuario tenga que entender las etapas.

- **Regresión sobre clientes ya configurados** → Nada de esto puede alterar un bot que ya funciona.

## Migration Plan

1. Migración aditiva: vocabulario, configuración de marca, estado del recorrido.
2. Recorrido guiado, con alta del proyecto y sus partes.
3. Entrega del material y arranque automático de la compilación.
4. Elección del tono sobre muestras renderizadas.
5. Reducción del panel del compilador y sustitución del vocabulario.

**Rollback:** revertir el código deja las tablas nuevas sin usar y el árbol intacto. Los proyectos creados desde el chat son filas normales de `scopes`, indistinguibles de las sembradas por SQL.

## Open Questions

Ninguna. Las decisiones estaban tomadas antes de escribir esta propuesta; lo que este cambio agrega es la corrección del panel del compilador, que se derivó de abrirlo y encontrar el modelo del sistema a la vista.
