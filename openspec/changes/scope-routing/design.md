## Context

El cambio `scope-tree` dejó el árbol funcionando, pero todas las rutas pasan el alcance raíz como punto de partida. La resolución ya acepta cualquier alcance; falta decidir cuál.

`extractMessage` en `webhook-validator.ts` extrae remitente, identificador de mensaje, texto y nombre, y descarta el resto del cuerpo que envía Meta. Ahí viaja el objeto `referral` de los mensajes originados en anuncios de clic a WhatsApp.

`user_sessions` ya guarda estado por conversación. `conversations` registra cada mensaje con su intención detectada.

La interpolación de variables en respuestas está declarada como `TODO` en `conversation.repository.ts` y nunca se implementó, aunque `bot_responses.variables` existe en el esquema desde la migración 001.

## Goals / Non-Goals

**Goals:**

- Que una conversación se resuelva contra el desarrollo correcto sin que el lead tenga que explicarlo.
- Que el ruteo sea determinista para el tráfico de anuncios, que es la mayoría.
- Que el foco persista y pueda cambiar durante la conversación sin perder lo anterior.
- Que dar de alta un desarrollo no obligue a editar textos a mano.
- Que con un solo alcance el comportamiento sea idéntico al actual.

**Non-Goals:**

- Resolver con un modelo de lenguaje los mensajes ambiguos. Se decide después, con datos.
- Medir progreso, score o citas por alcance.
- Interfaz de administración de alcances, alias y anuncios.
- Interpretar el contenido del anuncio más allá de su identificador.

## Decisions

### El anuncio rutea; el texto no

El identificador del anuncio determina el alcance con certeza y sin inferencia. El texto del primer mensaje, en cambio, no aporta señal: las frases prefabricadas de los anuncios de WhatsApp son idénticas entre campañas, así que todo lead de anuncio llega diciendo lo mismo.

Por eso el orden de precedencia es: anuncio de origen, luego mención explícita del lead, luego foco previo, y por último la raíz. Lo determinista antes que lo inferido.

*Alternativa descartada:* deducir el desarrollo del texto del primer mensaje. Es adivinar sobre una frase que por construcción no discrimina.

### El foco es estado de la conversación, no identidad del lead

Vive en la sesión y cambia durante la conversación. Es distinto del conjunto de intereses de una persona —que es durable y admite varios alcances a la vez—, y ese conjunto pertenece a `scope-progress`.

Se conserva también el foco previo. Sin él no hay forma de resolver una referencia al desarrollo anterior, y recuperarlo después es imposible.

### Cambiar de foco no borra nada

El cambio de foco solo mueve el punto de partida de la resolución. El estado asociado al alcance anterior permanece intacto, de modo que volver a él no pierde nada de lo conversado.

### El saludo se compone, no se escribe

Enumerar los desarrollos en un texto fijo obliga a editarlo a mano en cada alta, y ese texto es el mensaje de mayor volumen del bot. Se resuelve con la interpolación de variables que el esquema ya contempla y el código dejó pendiente.

*Alternativa descartada:* generar el saludo con un modelo de lenguaje. Introduce varianza, latencia y costo justo en el mensaje que más se envía, para producir una lista que los datos ya conocen.

### El reconocimiento de alias reutiliza el matcher

Los alias de un alcance son una lista cerrada y corta, exactamente la forma de problema que el matcher léxico ya resuelve con tolerancia a errores de escritura. No hace falta un mecanismo nuevo ni una llamada externa.

### Qué hacer con lo ambiguo se decide con datos

Cuando el matcher no logra atribuir un mensaje a un alcance, esta entrega resuelve desde el foco vigente o desde la raíz. Cubrir esos casos con un modelo de lenguaje es una decisión que conviene tomar midiendo su frecuencia real, no anticipándola: el vocabulario de dos desarrollos distintos se solapa poco, y el ruteo por anuncio ya cubre la mayor parte del tráfico.

Para poder medirlo, el alcance de cada mensaje queda registrado desde esta entrega.

## Risks / Trade-offs

- **El `referral` solo llega en el primer mensaje de la conversación** → El foco debe persistir desde ese momento; si se pierde, no hay segunda oportunidad de recuperarlo por esa vía.

- **Un anuncio puede quedar sin asociar a ningún alcance** → El sistema continúa sin ese foco en lugar de fallar. Conviene poder detectar anuncios activos sin asociación, porque son leads que se rutean peor de lo que podrían.

- **Un alias ambiguo entre dos alcances** → Debe resolverse de forma predecible y documentada; elegir en silencio uno de los dos reproduce la clase de falla silenciosa que ya costó varias rondas en `scope-tree`.

- **El saludo con muchos alcances** → Enumerarlos en texto plano deja de funcionar a partir de unos pocos. Esta entrega asume el número que el negocio maneja hoy; presentar una lista interactiva es un cambio de interfaz posterior.

- **Cambio de foco no deseado** → Que una mención de paso cambie el foco puede desviar la conversación. La mención debe ser explícita, no una coincidencia parcial.

- **Regresión con un solo alcance** → Todo el ruteo debe ser inerte cuando hay un único alcance activo. La línea base existente cubre ese caso y debe seguir idéntica.

## Migration Plan

1. Migración aditiva: asociación de anuncios a alcances, alias por alcance, foco y foco previo en la sesión, alcance en las conversaciones.
2. Captura del origen del mensaje en el webhook, sin cambiar el comportamiento todavía.
3. Resolución del foco y su persistencia.
4. Reconocimiento de alias y cambio de foco.
5. Interpolación de variables y saludo compuesto.

**Rollback:** revertir el código basta. Las columnas nuevas son aditivas y quedan sin usar; ninguna lectura previa depende de ellas.

## Open Questions

- ¿Cómo se resuelve un alias que pertenece a más de un alcance activo? La opción propuesta es no cambiar el foco y dejar constancia, antes que elegir uno en silencio.
- ¿El foco debe caducar tras un periodo de inactividad? Un lead que vuelve semanas después quizá venga por otro desarrollo. Conviene decidirlo observando el tiempo real entre conversaciones.
- ¿Qué ocurre si un anuncio apunta a un alcance que luego se desactiva? Debe definirse si se ignora el origen o se rutea al ancestro activo más cercano.
