## Why

El bot ya conversa: contesta desde el material, ofrece el paso siguiente con botones y el catalogo se edita sin recompilar. Lo que no se puede es **operarlo**.

La lista de intenciones enseña esto:

```
Precio y Costos
Precio y Costos
Precio y Costos
Precio y Costos
Precio y Costos
Precio y Costos
```

Seis filas identicas. Son correctas --hay seis alcances con precio propio: el negocio, Aura, Cala, Mare, Solara y Vento-- pero la pantalla no dice de quien es cada una, asi que hay que entrar a las seis para encontrar la de Solara. En la base ya es una pregunta con N respuestas: misma `intent_name`, distinto `scope_id`. Falta la pantalla que lo enseñe asi.

Y quedan dos acabados que el lead si ve:

- **El rotulo que no cabe.** Un boton de WhatsApp admite 20 caracteres. "Terreno y construccion" son 22, y el recorte por palabras lo deja en `[ Terreno y ]`, colgando. Al compilador se le pide un rotulo corto en el prompt pero nadie comprueba que lo sea.
- **La unidad repetida.** El valor del catalogo puede traer su unidad y la prosa repetirla: `{medio_bano} medio bano` sale como "1 medio bano medio bano". Se colapsa la repeticion de una palabra --"96 casas casas" ya no pasa-- pero no la de dos.

Se suma la deuda mas vieja del proyecto, que es del mismo tipo --lo que el panel enseña no es lo que el bot usa--: `advisor_phone`, `business_hours` y `advisor_email` viven en `bot_config` **y** en `agent_config` desde que la migracion 009 los redeclaro sin retirar los de la 007. El dashboard edita `bot_config`; parte del codigo lee `agent_config`. Leer del lado equivocado no falla: usa otro valor. Ya costo una ronda con el telefono del asesor.

## What Changes

- **Una pregunta, una fila.** La lista de intenciones agrupa por pregunta en vez de por registro. Dentro de cada una, el arbol de alcances con quien tiene respuesta propia y quien hereda.
- **"Hereda" es un estado, no un hueco.** Un alcance sin respuesta propia se ve como lo que es --contesta la general-- y se puede escribir una propia desde ahi. Borrar una propia devuelve a heredar.
- **El rotulo se comprueba al publicar.** Un rotulo que no cabe en un boton no se publica: se pide de nuevo, como ya se hace con la propuesta que el modelo no devuelve. Deja de depender de que el prompt se cumpla.
- **La unidad no se repite** aunque tenga varias palabras.
- **Una sola fuente para la configuracion del asesor.** `bot_config` se acota por alcance --nulo es global-- y las tres columnas duplicadas de `agent_config` se retiran. **BREAKING** para quien lea `agent_config` directamente.

## Capabilities

### New Capabilities
- `question-panel`: como se presenta una pregunta con sus respuestas por alcance, y como se crea o se borra una respuesta propia desde ahi.

### Modified Capabilities
- `document-compiler`: el rotulo corto de una pregunta se comprueba antes de publicar, no solo se pide.
- `response-composer`: al renderizar, la unidad que ya trae el valor no se repite en la prosa.
- `scope-routing`: la configuracion del asesor se resuelve por alcance desde una sola tabla.

## Impact

- `src/app/(dashboard)/intents/page.tsx`: la lista agrupa por pregunta; cada fila abre su arbol.
- `src/app/(dashboard)/intents/[intentId]/responses/page.tsx`: la pagina pasa a ser de la pregunta, no de un registro.
- `src/core/document-compiler/document-compiler.service.ts`: comprobacion del rotulo y reintento.
- `src/lib/interpolate-message.ts`: colapso de unidad de varias palabras.
- Base de datos: `bot_config` gana `scope_id`; se retiran `advisor_phone`, `business_hours` y `advisor_email` de `agent_config`. Migracion aditiva primero, retirada despues, para que produccion pueda aplicarlas por separado.
- `AGENTS.md` seccion 6: deja de describir la duplicacion como trampa conocida.
- Pruebas: una pregunta con seis alcances se presenta como una fila; un rotulo largo no se publica; una unidad de dos palabras no se duplica; la configuracion del asesor sale de la tabla acotada.
