## Context

Este es el cambio que da nombre a la rama. Los cuatro anteriores construyeron el destino; este construye la puerta de entrada.

Lo que ya existe y no hay que reinventar, verificado en el código:

- **Llamadas a modelos de lenguaje**: `src/app/api/intents/generate-patterns/route.ts` resuelve la llave desde Vault con `read_vault_secret`, lee `ai_model` de `bot_config`, y valida que quien llama sea un administrador activo. Ese camino ya funciona.
- **Almacenamiento de archivos**: el bucket `bot-media` de la migración 016, con sus políticas.
- **Contenido**: `intent_configurations` y `bot_responses` acotados por alcance, con el editor de bloques de `fragment-editor`.
- **Señal de lo que falta**: `intents_log` guarda cada detección con su mensaje original, y `conversations.was_fallback` marca los que no se entendieron. Hoy nadie los lee para esto.

El catálogo actual son nueve intenciones: `saludo`, `precio`, `ubicacion`, `modelo`, `creditos`, `seguridad`, `brochure`, `cita`, `asesor`.

### Qué produce el compilador y qué no

| | Lo produce el compilador | Lo pone otra cosa |
|---|---|---|
| Hechos con procedencia | ✓ | |
| Catálogo de preguntas candidatas | ✓ (preset + documento) | |
| Huecos de cobertura | ✓ | |
| Patrones del matcher | ✓ | |
| Texto de las respuestas | ✓ propone | el humano aprueba |
| Tono y vocabulario de marca | | `onboarding-chat` |
| Mensajes de sistema | | sembrados, `scope-routing` |
| Forma del árbol | ✓ propone | el humano confirma |
| Invitaciones a agendar | | el runtime, `scope-progress` |

## Goals / Non-Goals

**Goals:**

- Que dar de alta un desarrollo empiece por subir el material que el cliente ya tiene.
- Que cada frase que el bot diga sea rastreable hasta el documento y la parte de la que salió.
- Que el sistema diga qué no puede responder, antes de que un lead lo descubra.
- Que ninguna afirmación llegue a un lead sin que un humano la haya aprobado.
- Que volver a subir material no destruya el trabajo hecho a mano.
- Que el runtime no gane ni un milisegundo de latencia.

**Non-Goals:**

- Un modelo de lenguaje en el camino del mensaje.
- Sustituir el matcher o cambiar cómo se detecta la intención.
- El chat guiado de configuración.
- Un motor de diffs con estados por respuesta.

## Decisions

### La compilación ocurre antes, no durante

Es la decisión de la que cuelgan todas las demás. Un RAG en runtime tendría que buscar, redactar y responder dentro de la ventana de un mensaje de WhatsApp, y produciría cada vez una frase distinta que nadie revisó.

Aquí el modelo trabaja una vez, contra el documento completo, sin prisa; un humano revisa el resultado; y lo que queda guardado es contenido fijo que el matcher sirve. El modelo compila; el matcher ejecuta.

*Alternativa descartada:* recuperación en tiempo de respuesta. Cambia latencia y auditabilidad —las dos cosas que este producto tiene y un chatbot genérico no— por una flexibilidad que el catálogo de un desarrollo inmobiliario no necesita.

### Tres entradas, y el tono no sale del documento

El compilador recibe el corpus, el preset del giro y la configuración de marca. Importa que sean tres y no una: **un brochure está escrito en prosa publicitaria y el bot habla en frases de dos líneas**. Derivar el tono del documento produciría un bot que declama.

Del documento salen los hechos. Del preset salen las preguntas candidatas. De la marca sale cómo suena.

### Los hechos primero, las respuestas después

El primer paso no produce ni una frase dirigida a un lead: produce hechos atómicos con su procedencia —`precio_desde = 1,950,000`, del documento tal, en tal parte—.

Separarlo importa porque es lo que hace verificable el resultado. Un humano puede revisar cien hechos contra el brochure mucho más rápido que cien párrafos, y cuando una respuesta dice algo raro se puede ir al hecho y de ahí al documento.

### El reporte de huecos es lo que lo vuelve confiable

Un compilador que no sabe decir "el documento no menciona financiamiento" es un generador de mentiras plausibles: rellenaría ese hueco con algo razonable y falso, y nadie lo notaría hasta que un lead tomara una decisión con esa información.

Por eso el segundo paso deriva el catálogo de preguntas **y reporta cuáles se quedaron sin hechos que las respondan**. Un hueco no es un error del compilador: es información que el cliente todavía no ha entregado, y es accionable —la pide, o borra esa pregunta del catálogo—.

### El preset es una hipótesis, no una taxonomía

El modelo infiere el giro y el humano lo confirma, pero de ahí en adelante el preset se corrige solo por los dos lados: una pregunta sin hechos que la respondan aparece como hueco y se borra; una pregunta que nadie previó entra por el loop de fallbacks.

Si preset y documento difieren, **gana el documento**. El preset nunca aporta contenido, solo candidatos de pregunta.

### Los intents no se multiplican por alcance; las respuestas sí

El catálogo se hereda completo desde la raíz y cada nodo solo agrega sus excepciones. Es lo que ya hace el árbol de `scope-tree`, y significa que la pregunta "¿qué intenciones creo para este desarrollo?" tiene una respuesta aburrida: ninguna. Se crean respuestas.

Un hecho idéntico en todos los hijos sube al padre automáticamente. Esa parte es mecánica y no la decide el modelo.

### Dos compuertas de aprobación, en este orden

Primero se confirma la forma del árbol; después se genera el contenido. El orden no es cosmético: aprobar cuarenta respuestas y reestructurar el árbol después tira ese trabajo entero.

La segunda compuerta es el contenido, y se revisa **en un panel, no en un chat**. Revisar veinticuatro respuestas en burbujas de conversación es horrible; se necesita lista agrupada, procedencia al lado, los huecos visibles y aprobar en bloque.

### Recompilar compara hechos, no textos

Al subir material nuevo se comparan los hechos extraídos. Solo se regeneran las respuestas que dependen de un hecho que cambió.

La consecuencia es la que importa: **las ediciones a mano sobreviven solas**, sin necesidad de marcarlas ni protegerlas, porque nada las toca si su hecho no cambió. Para las que sí cambiaron y además habían sido editadas por un humano, basta avisar.

*Alternativa descartada:* estados por respuesta con un motor de diffs. Complejidad que la dependencia por hechos resuelve gratis.

### Cada fallback es el backlog de contenido

`intents_log` y `conversations.was_fallback` ya guardan lo que el bot no supo responder. Hoy esa señal solo se usa para escalar a un asesor y después se pierde.

El escalamiento es una falla con costo medible en horas de asesor, no un objetivo del producto. Leer esos registros agrupados convierte cada conversación fallida en una entrada de "esto falta compilar", y permite medir la cobertura en lo único que le importa al cliente: escalamientos evitados.

### Flexible en interpretar, rígido en afirmar

El principio transversal, aplicado aquí: el modelo puede leer, agrupar, proponer y ordenar. Lo que no puede es que su salida llegue a un lead sin pasar por un humano.

Interpretar es barato —el peor caso es un fallback—. Afirmar es donde vive el riesgo, porque una frase con un precio adentro sale a nombre de la marca del cliente.

### El documento entra entero; trocear es el último recurso

Un compilador no es un troceador. Trocear el texto en ventanas es una técnica de RAG, y existe porque hay que *recuperar* fragmentos relevantes para una pregunta concreta. Aquí no se recupera nada: se compila una vez, contra el material completo, y el modelo es quien interpreta.

Por eso el material se le entrega **completo y en su forma original** siempre que quepa, que es el caso normal —el texto útil de un brochure inmobiliario es una fracción de lo que admite cualquier modelo actual—. Los proveedores aceptan documentos como entrada nativa, no solo texto plano, y eso resuelve de raíz tres problemas que el troceado no resuelve:

- **Las tablas siguen siendo tablas.** No hay que protegerlas de un corte, porque no hay corte.
- **Un precio dentro de una imagen se lee**, porque el modelo ve la página, no un volcado de texto.
- **La página es un dato real**, no algo que haya que reconstruir después de aplanar el documento.

La extracción de texto pasa a ser el camino de los formatos que no son PDF, no el camino principal.

Cuando un documento de verdad no quepa, la unidad de división son **páginas o secciones**, nunca ventanas de tokens: son fronteras que el documento ya tiene y coinciden con el nivel de procedencia que elegimos. Un corte por página es explicable; un corte a los 4.000 tokens no lo es.

*Alternativa descartada:* trocear siempre por ventanas de texto. Se paga la fragilidad de los cortes en todos los documentos para resolver un problema que solo tienen unos pocos.

### Dos pasadas sobre el material, no una

La extracción de hechos se hace en dos tiempos, y por razones distintas.

La primera lee el material y propone hechos con su página. La segunda los consolida: une duplicados, detecta contradicciones —dos precios distintos para lo mismo, que casi siempre significa que uno está desactualizado en el documento— y aplica la regla de herencia hacia el ancestro.

Separarlas importa porque la consolidación es un problema distinto del de leer. Mezcladas, el modelo tiende a resolver la contradicción por su cuenta eligiendo una de las dos cifras, en silencio. Separadas, la contradicción se puede reportar como lo que es: algo que el cliente tiene que aclarar.

### Las dudas del compilador son anotaciones, no un riesgo abstracto

*Decidido con el usuario el 2026-08-15.*

Un compilador que sabe que algo puede estar mal y no lo dice obliga a revisar todo con la misma desconfianza. Uno que lo señala convierte la revisión en un triaje.

Cada propuesta lleva sus **señales de revisión**, visibles en el bloque que se va a aprobar:

| señal | qué significa | de dónde sale |
|---|---|---|
| sin respaldo | ningún hecho la sostiene | de la cobertura |
| contradicción | dos hechos discrepan | de la consolidación |
| procedencia dudosa | el modelo no pudo fijar la página con confianza | del modelo |
| dato sensible | contiene una cifra de dinero, una fecha o una condición legal | **regla determinista** |
| cambió | su hecho cambió desde la última compilación | de la recompilación |
| editada a mano | alguien la escribió o corrigió | del origen |

La de **dato sensible** es la más valiosa y la más barata: no depende del juicio del modelo, es una regla sobre el tipo del hecho. Ahí es donde vive el riesgo comercial —una frase con un precio adentro sale a nombre de la marca del cliente— y ahí es donde los ojos humanos rinden más.

Lo que cambia en la práctica: con cuarenta respuestas, "aprobar todo" es imprudente y "revisar una por una" es agotador, así que en la práctica se aprueba todo sin mirar. Con señales se aprueban treinta y cinco en bloque y se miran cinco. El panel ordena por señal, no por intención.

Hay una razón que va más allá del uso actual. Hoy quien revisa es quien construyó esto y comprueba cada cifra. El producto se vende por tenant a inmobiliarias, y mañana quien apruebe será alguien de marketing que no sabe qué mirar. **Las señales son lo que traslada ese cuidado a una persona que no lo tiene.**

### Tres papeles de modelo, no uno

`bot_config` tiene hoy un solo `ai_model`, que basta cuando el único uso es generar patrones. El compilador tiene tres trabajos con economías distintas:

- **Leer el documento y extraer hechos.** Se ejecuta una vez por documento, y su salida lleva precios dentro. Un error aquí se propaga a todas las respuestas que dependen del hecho. Aquí conviene el modelo más capaz disponible, y el costo es irrelevante comparado con las horas de transcripción que sustituye.
- **Redactar las respuestas.** Es la parte con más llamadas —una por par de alcance e intención— y la de menor riesgo: los hechos ya están fijados y verificados, y un humano lee el texto antes de aprobarlo. Un modelo económico basta.
- **Generar patrones del matcher.** Lo que ya existe y ya funciona con el modelo económico.

Que sean configurables por separado no es flexibilidad decorativa: es lo que permite gastar donde importa sin pagarlo en el resto.

*Cuál conviene se decide midiendo, no opinando:* compilar el mismo brochure con dos modelos y contrastar contra una lista de hechos hecha a mano. Es un documento y dos ejecuciones, y sustituye una discusión que de otro modo no se cierra.

### La compilación es por etapas, no una llamada larga

Un brochure completo no cabe en el tiempo de una petición: la plataforma corta las funciones mucho antes de que el modelo termine de leerlo entero.

Los tres pasos ya son la división natural —extraer hechos, derivar el catálogo, generar respuestas— y cada uno deja su resultado guardado antes de que empiece el siguiente. Una compilación interrumpida se retoma desde el último paso completo en lugar de empezar de cero, y ninguna etapa a medias deja contenido aprobado.

El proyecto ya tiene el patrón: `vercel.json` dispara rutas con `CRON_SECRET` para los seguimientos.

### Procedencia hasta la página, y el material se conserva

*Decidido con el usuario el 2026-08-15.*

La procedencia llega a **documento y página**. Guardar además el fragmento exacto haría la verificación de una línea en vez de una página, pero se rompe justo donde más duele: si el troceado corta una tabla de precios, la cita queda incompleta o descontextualizada, y una cita mal cortada es peor que ninguna porque parece verificada.

El **documento original se conserva**. Es lo que permite abrir la página que la procedencia señala, recompilar sin volver a pedirle el material al cliente, y auditar meses después de dónde salió una cifra. La contrapartida es material comercial de un cliente almacenado, que hereda las políticas del bucket.

Las dos decisiones se sostienen entre sí: la procedencia por página solo sirve para verificar si la página se puede abrir.

## Risks / Trade-offs

- **El modelo puede inventar un hecho que el documento no dice** → Es el riesgo central. La procedencia obligatoria lo acota: un hecho sin cita verificable no debería poder existir, y revisar hechos contra el documento es rápido.

- **La página que cita el modelo es una salida del modelo** → Puede equivocarse al atribuir un hecho a una página, y una procedencia incorrecta es peor que ninguna porque parece verificada. Es la razón de fondo para conservar el documento: la única defensa es poder abrirlo y comprobarlo.

- **Los formatos que no son PDF sí pasan por extracción** → Ahí vuelven los problemas de columnas y tablas. El sistema tiene que distinguir "el documento no lo dice" de "no lo pude leer": son problemas distintos y el cliente necesita saber cuál tiene.

- **Revisar sigue siendo trabajo humano** → El compilador reduce el trabajo, no lo elimina. Si la revisión resulta más lenta que escribir a mano, el cambio no sirve; por eso el panel y la aprobación en bloque son parte del alcance y no un extra.

- **Documentos grandes contra los límites del modelo** → Es el caso raro, pero existe: un catálogo corporativo de cientos de páginas. Dividir por páginas evita el corte arbitrario, pero pierde el contexto que cruza de una a otra —el encabezado de una tabla que empieza en la página anterior—.

- **Costo y disponibilidad del proveedor** → La compilación depende de un servicio externo que puede fallar o tardar. No puede bloquear nada del runtime, y una compilación a medias no puede dejar contenido inconsistente aprobado.

- **La confianza se pierde una sola vez** → Si un cliente encuentra una cifra inventada en una respuesta aprobada, deja de revisar y empieza a desconfiar de todo. La procedencia visible existe para eso.

- **Regresión sobre contenido existente** → Lo que ya está escrito a mano no puede verse afectado mientras nadie compile.

## Migration Plan

1. Migración aditiva: material, hechos con procedencia, dependencia entre respuestas y hechos, estado de aprobación, huecos.
2. Ingesta y extracción de texto, sin compilar todavía.
3. Extracción de hechos con procedencia.
4. Catálogo de preguntas y reporte de huecos.
5. Generación de patrones y respuestas propuestas.
6. Panel de revisión y aprobación.
7. Recompilación por dependencia de hechos.
8. Lectura de los fallbacks como backlog.

**Rollback:** revertir el código deja las tablas nuevas sin usar. El contenido aprobado ya vive en `intent_configurations` y `bot_responses`, que son las que lee el runtime, así que el bot sigue funcionando sin el compilador.

## Open Questions

Ninguna. La elección concreta del modelo de extracción se resuelve midiendo, según la tarea 1.5, y no bloquea el diseño: los tres papeles quedan configurables por separado.

Las dos que quedaban —el nivel de la procedencia y si se conserva el material— están resueltas arriba.
