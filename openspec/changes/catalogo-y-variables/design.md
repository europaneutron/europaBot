## Context

Los datos ya se extraen con procedencia: `compiler_facts` guarda clave, sujeto, valor, tipo, documento y pagina. Lo que no existe es un lugar donde esos datos vivan **despues** de la corrida.

Hoy el recorrido es: hecho extraido -> el modelo redacta una frase con la cifra dentro -> la frase se publica. A partir de ahi el dato solo existe copiado dentro de un texto, tantas veces como respuestas lo mencionen. En la corrida de FYMSA, `$2,980,000` esta en la respuesta de Solara y en la lista general del desarrollo; nada las mantiene de acuerdo.

Tres piezas del sistema ya apuntan hacia aqui:

- `interpolateMessage` (`src/lib/interpolate-message.ts`) ya sustituye `{variable}` en cualquier respuesta, y `bot_responses` ya tiene una columna de variables. La maquinaria de huecos existe; lo que falta es de donde salen los valores. Y hoy una variable ausente se resuelve como cadena vacia **en silencio**, que es el bug que hay que cerrar en el mismo movimiento.
- `resolveRows` ya resuelve contenido de foco hacia la raiz. Los valores del catalogo necesitan exactamente la misma herencia, no otra.
- `buildScopeOptions` ya quiere un dato por opcion para que el lead elija sin preguntar otra vez ("Aura · 3 rec · $1.85M"). Hoy lo tiene que sacar de la prosa; con catalogo lo lee.

## Goals / Non-Goals

**Goals:**

- Que cambiar un precio sea editar una celda, no recompilar un PDF.
- Que un dato exista una sola vez, y que toda respuesta que lo diga lo referencie.
- Que la procedencia sobreviva a la edicion: de que documento salio, y si una persona lo corrigio despues.
- Que una respuesta que no se puede completar no llegue al lead.

**Non-Goals:**

- **No entra LLM en el runtime.** Resolver un hueco es una consulta, no una redaccion.
- No es un editor de formulas ni de condicionales. Un hueco es un dato del catalogo, no una expresion.
- No se rediseña el editor de respuestas entero: gana enlazar datos y ver el resultado, y nada mas.
- La tabla no sustituye al compilador. Subir material sigue siendo como se llena; la tabla es como se corrige.

## Decisions

### El catalogo es una tabla propia, no `compiler_facts`

`compiler_facts` es historia: pertenece a una corrida, y una corrida es inmutable por diseño --es lo que permite comparar recompilaciones y detectar cambios--. El catalogo es lo contrario: estado actual, editable, sin corrida.

La tabla nueva se acota por alcance como el resto del contenido, con clave, valor, tipo, unidad y procedencia. Publicar una corrida escribe en ella; `compiler_facts` sigue guardando de donde vino cada cosa.

Alternativa descartada: marcar filas de `compiler_facts` como "vigentes". Mezcla dos ciclos de vida en una tabla y rompe la comparacion entre corridas, que es de lo poco que hoy funciona bien.

### Los valores se resuelven con la herencia que ya existe

Un hueco se resuelve con `resolveRows` sobre el catalogo: lo propio del alcance en foco, y si no hay, lo del ancestro. Es la misma regla que el contenido y por la misma razon --la direccion es del desarrollo, el precio es del modelo--, asi que no se inventa un segundo modelo mental.

### Un hueco sin dato apaga la respuesta entera

No se envia a medias. Una frase a la que le falta el dato no es una frase mas pobre: es una frase falsa o incomprensible ("Desde  MXN"). La respuesta se marca incompleta y el lead recibe el mismo trato que ante algo que el material no cubre, que ya esta resuelto.

Esto obliga a cerrar `interpolateMessage`: hoy devuelve cadena vacia para lo que no encuentra. Pasa a distinguir "no habia nada que sustituir" de "faltaba el valor", y quien envia decide con eso. Es un cambio pequeño con alcance amplio, porque esa funcion la usan tambien los mensajes de ruteo.

### La respuesta general se compone, no se redacta

Enumerar los modelos con su precio es una operacion sobre la tabla, no prosa. Redactarla una vez garantiza que envejezca mal: es la causa de que el precio general y el del modelo se desincronicen, y de que la lista mezcle ramas.

Con el catalogo, esa respuesta pasa a ser una plantilla sobre las filas --nombre, dato distintivo, rama a la que pertenece-- y las dos reglas que introdujimos en `desambiguacion-enumerada` dejan de tener que bloquear nada: se cumplen por construccion.

### Sustituir sigue ganando, pero avisando

La regla de `material-sustituye` no cambia: al aprobar, el bot pasa a ser el material. Un valor corregido a mano que la corrida nueva contradice se reemplaza como cualquier otro contenido.

Lo que se añade es que se **vea antes**: la pantalla de aprobacion lista los valores editados por una persona que van a ser sustituidos, con el valor viejo y el nuevo. Aprobar sin saber que se pierde una correccion es la clase de sorpresa que ya nos costo una vez.

## Risks / Trade-offs

- **La prosa con huecos puede quedar agramatical** ("Desde {precio} MXN" cuando el valor ya trae la moneda) → el valor guarda su unidad y su formato, y el editor enseña la frase renderizada antes de guardar. Lo que se ve es lo que sale.
- **Apagar una respuesta por un dato ausente puede dejar mudo al bot en una pregunta que antes contestaba** → por eso la propuesta tampoco se publica sin sus datos, y el panel lo dice. Un hueco visible es mejor que una frase rota, pero solo si se ve.
- **El modelo puede seguir metiendo cifras en la prosa** → la comprobacion previa a publicar rechaza una respuesta compilada con una cifra literal donde deberia haber un hueco, del mismo modo que ya rechaza la que no declara su oferta.
- **La tabla puede volverse la interfaz principal y desplazar al compilador** → es aceptable: subir material es como se llena de golpe, la tabla es como se mantiene. Son dos usos distintos del mismo dato.

## Migration Plan

Migracion aditiva con la tabla de valores. Las respuestas que hoy llevan cifras dentro siguen funcionando: una respuesta sin huecos no depende del catalogo y se envia igual. La conversion ocurre sola en la siguiente recompilacion, respuesta por respuesta.

Revertir el codigo deja el catalogo poblado y sin usar, sin romper nada.

## Open Questions

- ¿Que hace la tabla con un dato que el material trae y ninguna respuesta usa? Guardarlo es barato y sirve para las opciones enumeradas; mostrarlo todo puede volver la tabla ilegible. Probablemente se guarda todo y se muestra por relevancia.
- Formato y unidad: si el valor guarda "$2,980,000 MXN" o guarda 2980000 con moneda aparte. Lo segundo permite comparar y ordenar --util para estrechar cuando hay mas de diez opciones-- pero obliga a decidir el formato al renderizar.
