## Context

Con `material-sustituye` terminado, el compilador lee el material, propone la estructura del negocio completo y publica sustituyendo lo anterior. El recorrido del 17 de agosto de 2026 sobre FYMSA deja el arbol impecable —nueve alcances, dos desarrollos, sus modelos, los lotes, cero amenidades como producto— y 37 respuestas publicadas.

Y aun asi el bot no entiende:

```
lead: que casas manejan   -> [FALLBACK]
lead: cuanto cuesta       -> [FALLBACK]
lead: precio de Solara    -> [FALLBACK]
lead: me interesa Europa  -> "Áreas verdes en el 22% de la superficie, casa club..."
```

Porque lo que se publica como vocabulario es esto:

```
precio           keywords {precio}            sinonimos {}
ubicacion        keywords {ubicacion}         sinonimos {}
precio_modelos   keywords {precio,modelos}    sinonimos {}
```

El esquema pide keywords, sinonimos, erratas y frases; el modelo devuelve las listas vacias y lo unico que sobrevive son las palabras del nombre. El ultimo turno enseña el riesgo peor: no falta respuesta, **sobra la equivocada** —la unica intencion con vocabulario cercano gana—.

La restriccion que enmarca todo esto no ha cambiado: el runtime es matcher puro y no llama al modelo durante un mensaje. Todo lo que aqui se decide ocurre en la compilacion.

## Goals / Non-Goals

**Goals:**

- Que el vocabulario salga del material del cliente y en la lengua en que un lead escribe.
- Que una propuesta muda no llegue a produccion, comprobado de forma determinista y no por confianza en el modelo.
- Que las preguntas de siempre se llamen igual en todas las corridas.
- Desbloquear el recorrido de aceptacion 9.1-9.4 de `material-sustituye`.

**Non-Goals:**

- Desambiguacion entre respuestas parecidas cuando varias enganchan. Es la spec siguiente.
- Tocar el matcher. Se reutiliza tal cual, y esa es justamente la garantia.
- Cualquier llamada al modelo en tiempo de conversacion.

## Decisions

### La comprobacion usa el matcher del runtime, no una heuristica aparte

Despues de que el modelo propone, se construye un `FuzzyMatcher` con los patrones propuestos y se le pasan la pregunta del catalogo y un par de reformulaciones. Si no enganchan, la propuesta no se publica.

Usar el mismo matcher es lo que hace que la comprobacion signifique algo: mide exactamente lo que va a pasar cuando escriba un lead, no una aproximacion. Una comprobacion de "trae al menos tres sinonimos" se satisface con tres sinonimos inutiles.

Alternativa descartada: exigir minimos por lista en el esquema JSON. Ayuda, pero un modelo cumple un minimo repitiendo la misma palabra. Se dejan los minimos como primera barrera y la comprobacion como la que decide.

### Las reformulaciones salen del material, no de una lista del sector

Al modelo se le pide, junto a cada respuesta, como preguntaria esto un lead por WhatsApp. Esas frases son a la vez vocabulario y material de la comprobacion.

Cablear "cuanto cuesta", "que precio tiene" en el codigo funcionaria para inmobiliarias y fallaria con el cliente que vende bodegas o consultorios. El material dice "casas" y "lotes de terreno"; de ahi tienen que salir las palabras.

### Bloquear una propuesta no bloquea la publicacion

Una propuesta que no pasa la comprobacion queda fuera y su pregunta conserva lo que hubiera. Las demas se publican.

La alternativa —abortar la publicacion entera— convierte un fallo del modelo en una pared: el cliente sube su material, espera, y no obtiene nada. Y contradice lo que ya decidimos para la sustitucion: se sustituye por algo, y si de una pregunta no hay nada que publicar, lo anterior se queda.

### El catalogo estable es el que ya existe

`REAL_ESTATE_PRESET` ya nombra `precio`, `ubicacion`, `modelo`, `creditos`, `seguridad`, `amenidades` y `brochure`. Lo que el modelo descubra se mapea contra el, y solo se admite un nombre nuevo cuando no encaja en ninguno.

Es lo que evita `precio_modelos` junto a `precio`, y lo que hace que recompilar el mismo material no produzca un catalogo distinto cada vez.

### Empobrecer se marca, no se bloquea

Si el vocabulario nuevo reconoce menos formas que el anterior, se marca para que la persona lo vea antes de publicar. No se bloquea: puede ser correcto —el material cambio y esa pregunta ya no aplica igual— y quien decide es quien publica.

## Risks / Trade-offs

- **El modelo escribe frases que enganchan la comprobacion pero no lo que un lead diria** → La comprobacion mide alcance, no naturalidad. Se acota pidiendo las frases al modelo por separado de las keywords y comprobando contra la pregunta del catalogo, que no la escribio el.

- **Vocabularios de preguntas vecinas se solapan y el matcher elige mal** → Es el caso de "me interesa Europa" contestado con amenidades. Este cambio lo reduce al dar a cada pregunta vocabulario propio, pero elegir entre varias que enganchan es la spec de desambiguacion. Aqui solo se anota.

- **La comprobacion alarga la etapa de contenido** → Es local y sin red: construir un matcher y probar unas frases por propuesta. Frente a los segundos que tarda el modelo, no se nota.

- **Un cliente con material pobre acaba con la mitad de las preguntas bloqueadas** → Es informacion util y aparece donde ya se reportan los huecos de cobertura. Es preferible a un bot que contesta mal.

## Migration Plan

1. Migracion aditiva con la senal de revision nueva. No cambia datos.
2. El contenido ya publicado no se toca. La comprobacion aplica a lo que se compile a partir de ahora.
3. Reversion: sin la comprobacion se vuelve al comportamiento anterior; lo publicado sigue valido.

## Open Questions

- Ninguna pendiente.
