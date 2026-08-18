## Why

El compilador ya lee bien el material y publica bien la estructura. Lo que no funciona es el puente entre lo que el material dice y lo que un lead escribe: **el bot compilado entiende menos que el sembrado a mano**.

Medido el 17 de agosto de 2026 con `scripts/walkthrough-fymsa.ts`, sobre el material de FYMSA compilado y publicado —arbol correcto, nueve alcances, 37 respuestas publicadas—:

```
lead: que casas manejan   -> [FALLBACK]
lead: cuanto cuesta       -> [FALLBACK]
lead: precio de Solara    -> [FALLBACK]
lead: aceptan mascotas    -> [FALLBACK]
lead: me interesa Europa  -> "Áreas verdes en el 22% de la superficie, casa club..."
```

La causa esta en lo que se publica como vocabulario:

```
precio           keywords {precio}            sinonimos {}
ubicacion        keywords {ubicacion}         sinonimos {}
precio_modelos   keywords {precio,modelos}    sinonimos {}
amenidades       keywords {amenidades}        frases ["¿Qué amenidades tiene?"]
```

El esquema le pide al modelo keywords, sinonimos, erratas y frases. Devuelve las listas vacias, y lo unico que queda son las palabras del nombre de la intencion. Un bot que solo entiende la palabra exacta no es un bot.

Hay un segundo defecto encima: las preguntas se nombran con lenguaje de catalogo inventado por corrida —`condiciones_comerciales`, `fichas_modelos`, `terrenos_disponibles`, `inventario_desarrollos`— y como el vocabulario sale del nombre, la intencion nace inalcanzable. Nadie escribe "condiciones comerciales" en WhatsApp.

Y el ultimo turno muestra el riesgo peor: no es solo que falte respuesta, es que **contesta otra cosa**. "Me interesa Europa" recibio las amenidades porque era la unica intencion con vocabulario cercano.

## What Changes

- El vocabulario se genera desde el material y en la lengua del lead: sinonimos, erratas y frases completas, no la palabra del nombre. Si el material dice "casas" y "lotes de terreno", el bot entiende "que casas manejan" sin que nadie lo escriba a mano. El proximo cliente vende bodegas.
- **BREAKING** Una propuesta cuyo vocabulario no reconoce su propia pregunta no se publica. La comprobacion es determinista y corre despues del modelo: se pasa la pregunta del catalogo y un par de reformulaciones por el mismo matcher que usa el runtime, y si no enganchan, la propuesta se marca y queda fuera de la publicacion.
- Las preguntas se nombran con un catalogo estable (`precio`, `ubicacion`, `modelo`, `amenidades`, `creditos`, `seguridad`, `brochure`). Lo que el material aporta y no encaja en el catalogo se admite, pero con nombre en lengua de lead y sometido a la misma comprobacion.
- Publicar deja de poder reducir el vocabulario de una pregunta: si lo que llega es mas pobre que lo que habia, se marca en vez de sustituir en silencio.
- El runtime no cambia: sigue sin llamar al modelo durante un mensaje.

## Capabilities

### New Capabilities
- `matcher-vocabulary`: que vocabulario tiene que producir una compilacion para que el bot entienda a un lead, y que comprobacion lo respalda antes de publicar.

### Modified Capabilities
- `document-compiler`: la etapa de redaccion produce vocabulario verificable y nombra las preguntas con el catalogo estable.

## Impact

- `src/core/document-compiler/document-compiler.service.ts`: prompt y esquema de la etapa de redaccion, con minimos por lista; mapeo al catalogo estable; comprobacion determinista antes de proponer.
- `src/core/document-compiler/compiler-rules.ts`: catalogo estable y la comprobacion de que el vocabulario reconoce su pregunta.
- `src/core/intent-engine/fuzzy-matcher.ts`: se reutiliza tal cual para la comprobacion. No se modifica.
- Migracion: senal de revision nueva para el vocabulario pobre. Aditiva.
- `src/app/(dashboard)/compiler/page.tsx`: la propuesta bloqueada se ve y se explica.
- Pruebas: `scripts/test-document-compiler.ts` para la comprobacion; el recorrido `scripts/walkthrough-fymsa.ts` pasa a ser criterio de aceptacion y desbloquea las tareas 9.1-9.4 de `material-sustituye`.
