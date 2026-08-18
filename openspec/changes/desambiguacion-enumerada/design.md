## Context

El runtime ya sabe casi todo lo que hace falta: `user_sessions` guarda el foco y la pregunta retenida (`pending_scope_message`, migracion 028), `resolveRows` resuelve de foco hacia la raiz, `extractMessage` convierte un toque de WhatsApp en el **identificador** del boton y no en su titulo (`webhook-validator.ts:96`), y `sendInteractiveButtons` manda botones hoy en el flujo de cita.

Lo que falta no es transporte ni almacenamiento: es que el bot sepa **a que nivel esta la duda** y **que genere las opciones desde el catalogo**.

Tres piezas concretas lo bloquean hoy:

1. `scopeRoutingRepository.isIntentScopeDependent(intentName)` responde un booleano. Con esa respuesta el procesador solo puede mandar el texto fijo `scope_disambiguation_message` con la lista de primer nivel. No hay forma de preguntar por modelos, ni de saber que con un solo desarrollo la duda esta un nivel mas abajo.
2. La deteccion parte del foco: `getVisibleIntents` resuelve de foco hacia la raiz. Sin foco solo ve la raiz, asi que una pregunta que solo existe en las ramas —`ubicacion`, cuando cada desarrollo tiene direccion propia— **no existe** y cae al fallback. Tres fallbacks seguidos escalan al asesor: medido, la cuarta pregunta del lead se guardo como su nombre.
3. `si` esta en las palabras vacias del matcher fuera del flujo de cita, y ninguna oferta deja constancia. Una respuesta que termina en si/no es un callejon.

## Goals / Non-Goals

**Goals:**

- Que la duda se resuelva enumerando desde el catalogo, al nivel donde las respuestas difieren.
- Que mencionar un alcance a secas sea una respuesta valida, y que saludar suelte el foco.
- Que un afirmativo tenga contra que resolverse.
- Que el compilador no publique respuestas que hagan imposible lo anterior: ofertas de si/no sin declarar, y listas que cruzan ramas sin nombrarlas.

**Non-Goals:**

- **No entra LLM en el runtime.** Ni para desambiguar, ni para elegir el nivel, ni para leer la respuesta del lead.
- **Botones redactados a mano, no.** Un boton con destino escrito a mano es un grafo de conversacion: destinos, ciclos, destino borrado. Las opciones salen del catalogo y de nada mas.
- Preguntas combinatorias abiertas ("algo para cinco personas bajo tres millones") siguen yendo al asesor. La enumeracion con el dato encima recupera buena parte de ese caso por navegacion.
- La tabla del catalogo editable a mano es otro cambio.

## Decisions

### El nivel de la duda se calcula, no se configura

`isIntentScopeDependent` pasa de booleano a devolver **donde esta la duda**: el alcance desde el que preguntar y los candidatos a enumerar.

El calculo parte del foco (o de la raiz si no hay) y baja mientras haya un solo camino: si en el nivel actual solo un descendiente define contenido propio para la intencion, no hay duda ahi y se sigue bajando. Se detiene en el primer nivel donde dos o mas descendientes definen contenido distinto. Ese nivel es la pregunta, y sus alcances son las opciones.

Esto da gratis dos escenarios de la spec: con un solo desarrollo no se pregunta por desarrollo pero si por modelo, y con dos desarrollos que comparten horario no se pregunta el horario.

Alternativa descartada: marcar las intenciones como dependientes del alcance en una columna. Es configuracion que se desincroniza del contenido en la primera recompilacion, y la regla ya existente —derivarlo de los datos— es la correcta.

### Una intencion visible aunque solo viva en las ramas

La deteccion sin foco pasa a considerar tambien las intenciones de los descendientes alcanzables, **solo para detectar**. La resolucion de contenido no cambia: sigue siendo de foco hacia la raiz.

Detectar sin poder resolver es exactamente la situacion que la desambiguacion existe para atender. Hoy esa combinacion se confunde con "no entendi", que es la peor lectura posible: el bot si entendio, lo que le falta es de cual.

### Las opciones viajan por identificador

Cada opcion enumerada lleva como identificador el `scope_id`, con un prefijo que la ata a la oferta que la genero. El toque devuelve ese identificador y el foco se fija sin pasar por el matcher.

Cuando el lead **escribe** en vez de tocar —lo normal fuera de WhatsApp, y frecuente dentro— el texto se resuelve primero contra los titulos de las opciones ofrecidas y solo despues contra el matcher general. Las opciones vivas son un vocabulario cerrado y pequeño: ahi la coincidencia difusa es segura, y evita que "Europa" tenga que competir con el resto del catalogo.

### La oferta pendiente vive junto a la pregunta retenida

`user_sessions` gana la oferta: que se ofrecio, las opciones con su alcance, y cuando. Es el mismo sitio y el mismo ciclo de vida que `pending_scope_message`, y caduca con el mismo periodo que el foco.

Una oferta se consume cuando el lead responde con un afirmativo o eligiendo una opcion, y se descarta en cuanto el bot contesta algo sin usarla. Sin eso, un "si" de tres turnos despues resolveria una oferta que el lead ya olvido.

Alternativa descartada: tabla propia de ofertas. No hay caso que necesite historial de ofertas, y una tabla mas es otra RLS, otro grant y otro borrado en cascada.

### Los afirmativos dejan de ser palabra vacia solo cuando hay oferta

La lista de afirmativos ya existe dentro del flujo de cita. Se extrae a un solo lugar y se consulta **antes** del matcher, pero unicamente cuando hay una oferta viva. Sin oferta, `si` sigue siendo palabra vacia y el mensaje va al matcher como hoy; si el mensaje entero era el afirmativo, la respuesta es "¿si a que?" con las opciones disponibles, no el fallback.

Un afirmativo contra una oferta de varias opciones no elige: repite las opciones. Elegir por "si" entre dos desarrollos seria adivinar.

### Las dos reglas nuevas del compilador son de publicacion, no de redaccion

La comprobacion previa a publicar —la que `vocabulario-del-matcher` ya introdujo para el vocabulario que no alcanza su pregunta— gana dos casos: una respuesta que termina en pregunta de si/no sin oferta declarada, y una respuesta que enumera datos de mas de una rama sin nombrarlas. Las dos se bloquean con motivo visible y el resto de la corrida se publica igual, que es como ya funciona el bloqueo.

La segunda regla es la que hoy produce "Hay Vento desde $2,340,000, Cala desde $1,420,000, ..." mezclando los dos desarrollos de FYMSA en una sola lista.

## Risks / Trade-offs

- **Bajar de nivel automaticamente puede enterrar al lead** → el descenso se detiene en el primer nivel con duda real, nunca enumera dos niveles a la vez, y siempre afirma lo que ya es cierto antes de preguntar.
- **Mas de diez opciones no se puede enumerar en WhatsApp** → hay que estrechar antes por un criterio del catalogo. Si no hay ninguno disponible, es mejor decirlo y pasar al asesor que mandar una lista que el transporte va a rechazar.
- **Resolver el texto del lead contra las opciones antes que contra el matcher puede secuestrar una pregunta** → solo se intenta cuando el mensaje no detecta ninguna intencion, que es la misma regla que ya gobierna la pregunta retenida.
- **Dos reglas nuevas de bloqueo pueden dejar una corrida casi vacia** → el bloqueo es por propuesta y con motivo; una corrida que bloquea mucho es informacion sobre el material, no un error del compilador. Aun asi, el resumen de publicacion tiene que dejar ver cuantas quedaron fuera y por que.
- **La oferta caduca con el foco** → un lead que vuelve al dia siguiente y escribe "si" recibe "¿si a que?". Es la respuesta correcta.

## Migration Plan

Una migracion aditiva sobre `user_sessions` para la oferta pendiente, del mismo tipo que la 028. Nada que reescribir: las sesiones existentes arrancan sin oferta, que es el estado por defecto.

El descenso de nivel y la deteccion en ramas no tocan datos. Si algo sale mal, revertir el codigo devuelve el comportamiento anterior sin dejar filas huerfanas.

## Open Questions

- Con mas de diez opciones, ¿que criterio estrecha? Rango de precio es el unico que el catalogo de FYMSA soporta hoy. Queda por decidir si el criterio se elige por datos o se declara en el compilador.
- ¿Un afirmativo contra una oferta de dos opciones deberia elegir la primera cuando el bot la destaco ("¿te muestro Aura?")? Repetir las opciones es lo seguro; destacar una y que el "si" la tome es lo natural. Se decide al implementar la primera oferta destacada.
