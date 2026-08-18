## Why

Hoy cambiar un precio obliga a recompilar un PDF. Las cifras viven dentro del texto de cada respuesta:

```
"El Modelo Solara parte de $2,980,000 MXN."
"Hay Vento desde $2,340,000 MXN, Cala desde $1,420,000 MXN, lotes desde $780,000 MXN..."
```

Ese dato --$2,980,000-- esta escrito en dos sitios que nadie mantiene sincronizados. Cuando el cliente suba el precio de Solara tiene que volver a subir el folleto, esperar la corrida, revisar y aprobar, para cambiar seis caracteres. Y si el compilador redacta distinto esa vez, cambia tambien la prosa que ya estaba aprobada.

De ahi salen tres problemas que hemos estado parcheando por separado:

1. **La respuesta general y la del modelo se desincronizan.** No hay forma de que la lista del desarrollo sepa que el precio de Solara cambio. La regla `crosses_branches_unnamed` que acabamos de introducir bloquea la prosa que mezcla ramas, pero bloquear es taparlo: esa lista deberia **componerse** del catalogo en vez de redactarse.
2. **La procedencia se pierde en cuanto alguien edita.** Hoy `compiler_facts` guarda de que documento y que pagina salio cada dato, pero vive atado a una corrida. Un valor corregido a mano no tiene donde vivir con su historia.
3. **Un hueco sin dato sale al lead.** `interpolateMessage` sustituye una variable ausente por cadena vacia, en silencio (`interpolate-message.ts:8`). Es el bug de `"Hola {nombre}"` convertido en `"Hola "`, pero saliendo por WhatsApp.

El compilador ya extrae los datos con su procedencia. Lo que falta es que dejen de ser el resultado de una corrida y pasen a ser **el estado actual del negocio**: una tabla que se edita, y una prosa que la referencia en vez de copiarla.

## What Changes

- **El catalogo es una tabla viva.** Cada alcance tiene sus valores con su clave, su valor, su unidad y su procedencia. Publicar una corrida los escribe; la pantalla los edita. Dejan de existir solo dentro de la corrida que los produjo.
- **Una pantalla de tabla por alcance**, con el dato editable y la fuente al lado: `Modelo Solara · precio · $2,980,000 · brochure.pdf p.3`. Es la pantalla que hoy no existe y que obliga a recompilar por un numero.
- **En el editor de respuestas nunca se escribe un numero: se escribe la frase y se enlaza el dato.** Debajo se ve renderizada con el valor real. **BREAKING** para las respuestas compiladas: la etapa de redaccion pasa a producir prosa con huecos, no con cifras.
- **Un hueco sin dato no se manda.** Ni vacio ni con el token crudo: la respuesta que no se puede completar no se envia, y el lead recibe el mismo trato que ante una pregunta que el material no cubre.
- **La respuesta general se compone del catalogo.** Enumerar los modelos con su precio deja de ser redaccion y pasa a ser una plantilla sobre la tabla, asi que no puede desincronizarse ni mezclar ramas sin nombrarlas.
- **Editar a mano deja constancia y sobrevive a la vista.** Un valor corregido por una persona se marca como tal y la pantalla de aprobacion de la siguiente corrida dice cuales va a sustituir el material, antes de aprobar. La regla de `material-sustituye` no cambia --al aprobar, el bot pasa a ser el material-- pero deja de ser una sorpresa.
- La procedencia viaja con el valor: que documento, que pagina, y si fue una persona quien lo escribio.

## Capabilities

### New Capabilities
- `catalog-values`: que es el catalogo, como se escribe al publicar, como se edita y que procedencia conserva cada valor.
- `linked-variables`: la prosa con huecos enlazados a datos del catalogo, como se resuelven por alcance y que pasa cuando falta uno.

### Modified Capabilities
- `document-compiler`: la etapa de redaccion produce prosa con huecos en vez de cifras, y publicar escribe el catalogo ademas de las respuestas.
- `scoped-content`: una respuesta puede depender de valores del catalogo, y esa dependencia decide si se puede publicar y si se puede enviar.
- `response-composer`: el editor enlaza datos en vez de admitir cifras escritas, y muestra la vista renderizada con el valor real.

## Impact

- Base de datos: tabla nueva de valores de catalogo, acotada por alcance como el resto del contenido, con su procedencia y su marca de edicion humana. Migracion aditiva.
- `src/core/document-compiler/document-compiler.service.ts`: la etapa de redaccion pide prosa con huecos; publicar escribe el catalogo.
- `src/lib/interpolate-message.ts`: una variable ausente deja de resolverse en silencio como cadena vacia.
- `src/core/conversation/message-processor.ts`: resolver una respuesta incluye resolver sus valores por alcance, con la misma herencia que el contenido.
- `src/core/conversation/scope-enumeration.service.ts`: las opciones enumeradas toman su dato distintivo del catalogo en vez de leerlo de la prosa.
- Pantallas: la tabla del catalogo (nueva) y el editor de respuestas (enlazar datos, vista renderizada).
- Pruebas: una respuesta con un hueco sin dato no se envia; cambiar un valor en la tabla cambia lo que contesta el bot sin recompilar.
