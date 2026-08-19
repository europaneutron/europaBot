## Context

El dato ya esta bien: una pregunta es una `intent_name` y cada alcance que la responde tiene su fila con su `scope_id`. `resolveRows` elige por foco y el lead nunca recibe mas de una. Lo que no se movio desde antes de que existieran los alcances es la pantalla: `intents/page.tsx` pinta una fila por registro y solo `display_name`, asi que seis respuestas de precio se ven como seis "Precio y Costos" identicas.

Los otros dos son acabados medidos contra el bot publicado: `[ Terreno y ]` colgando en un boton, y "1 medio bano medio bano" en la prosa.

Y la duplicacion de `agent_config` / `bot_config` lleva abierta desde la migracion 009. `AGENTS.md` la documenta como trampa conocida y `bot_config` como fuente de verdad, que es un parche: la trampa sigue ahi para quien no lea esa seccion.

## Goals / Non-Goals

**Goals:**

- Que una pregunta se vea como una pregunta, con sus respuestas por alcance dentro.
- Que heredar sea visible y reversible desde la misma pantalla.
- Que un rotulo que no cabe no llegue nunca a un boton.
- Que la configuracion del asesor tenga un solo sitio donde vivir.

**Non-Goals:**

- **No entra aqui que sustituir borre de verdad.** Las 308 intenciones archivadas y los 94 alcances retirados son un problema real y con dueño distinto: tocan la retencion, no la legibilidad.
- No se rehace el editor de una respuesta. Gana el contexto de a que pregunta y a que alcance pertenece, y nada mas.
- No se rediseña la pantalla de catalogo.
- No entra LLM en ninguno de los dos lados.

## Decisions

### La pagina es de la pregunta, no del registro

Hoy la ruta es `/intents/<id>/responses`, donde `<id>` es una fila concreta --el precio de Solara, no "el precio"--. La pagina pasa a identificarse por la pregunta, y el registro concreto se elige dentro.

El alcance no se agrega a la ruta: la pagina enseña el arbol entero y el registro se abre ahi. Meterlo en la ruta obligaria a decidir un alcance por omision, que es justo la decision que hoy hace que la lista sea ilegible.

### Heredar se calcula, no se guarda

Un alcance "hereda" cuando no tiene fila propia para esa pregunta. No hace falta una marca: es la ausencia. La pantalla lo presenta como estado y las dos operaciones --escribir una propia, borrarla-- son crear y borrar esa fila.

Borrar la fila de la que otros heredan es la unica que necesita aviso, porque deja mudos a varios alcances a la vez. Se dice cuantos antes de hacerlo, con la misma logica de `resolveRows` que usa el runtime.

### El rotulo se reintenta, no se recorta

Ya existe el patron: cuando el modelo no devuelve una propuesta, se le pide otra vez solo lo que falto. El rotulo usa el mismo camino. Recortar por palabras se queda como ultimo recurso --y recortando desde la clave, no desde la pregunta-- porque "Terreno y" no es un rotulo, es un accidente.

Alternativa descartada: pedir el rotulo en una llamada aparte para todas las preguntas. Es una llamada mas por corrida para un campo de dos palabras.

### La unidad se compara por su cola

El valor rendido termina en su unidad --"1 medio bano"-- y la prosa la repite justo detras. Se compara la cola del valor contra el arranque del texto que sigue, palabra por palabra, y se quita lo que coincida. Solo alrededor de un valor sustituido: una repeticion que ya estaba escrita en la plantilla no se toca.

### La configuracion del asesor se mueve en dos pasos

Primero `bot_config` gana `scope_id` y el codigo lee de ahi con herencia; despues se retiran las columnas de `agent_config`. Dos migraciones, no una: produccion puede aplicar la primera sin ventana y la segunda cuando nada lea ya del lado viejo.

La resolucion es la misma que la del contenido. Un desarrollo puede tener su propio asesor; si no lo tiene, hereda el del negocio.

## Risks / Trade-offs

- **Agrupar por nombre puede juntar dos preguntas que solo comparten nombre** → no puede: `intent_name` es la identidad de la pregunta en todo el sistema, y el runtime ya resuelve por ella.
- **La pantalla nueva es la que mas se usa y la unica sin prueba automatica posible** → verificacion manual en navegador obligatoria antes de pedir revision, como ya paso dos veces en este proyecto con `fragment-editor` y con el panel del compilador.
- **Retirar columnas de `agent_config` rompe a quien las lea directamente** → por eso van en dos pasos, y el segundo se aplica cuando una busqueda en el codigo no encuentre ninguna lectura.
- **El colapso de unidad puede comerse una palabra legitima** → solo actua pegado a un valor sustituido y solo si coincide literalmente; fuera de ahi el texto se respeta.

## Migration Plan

`bot_config.scope_id` aditiva, con las filas existentes como globales. Lectura por herencia detras. Retirada de las tres columnas de `agent_config` en una migracion posterior.

Las pantallas no necesitan migracion: leen lo que ya existe.

## Open Questions

- La lista de preguntas, ¿ordena por uso, por alfabeto o por alcance? Por uso seria lo util, pero hoy no se registra cuantas veces se contesto cada una.
- Cuando un alcance hereda, ¿se enseña la respuesta heredada completa o solo de quien la hereda? Completa ayuda a decidir si hace falta una propia; con veinte alcances la pantalla se vuelve larga.
