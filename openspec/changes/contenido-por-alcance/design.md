## Context

`scope-tree` dejó resuelta la resolución de contenido hacia arriba: `resolveRows` recorre del alcance en foco a la raíz y toma la primera fila por clave. `scope-routing` dejó resuelto el foco. La simulación de la conversación objetivo confirma que ambos funcionan: sembrando intenciones propias por alcance a mano, la herencia, el cambio de foco y la pregunta retenida se comportan como se espera.

Lo que no existe es el productor. Tres líneas de `generateContent` explican los tres defectos:

```ts
const intents = await documentCompilerRepository.getVisibleIntents(run.scope_id);
// resuelve hacia la raíz: devuelve las intenciones de la raíz, no las del alcance

if (!intent || !proposal) return [];
// lo que no está entre las nueve intenciones sembradas se descarta sin aviso

scopeId: run.scope_id,   // todo al alcance de la corrida
intentId: intent.id,     // el id de la intención RAÍZ
```

Y el runtime, al resolver, devuelve **todas** las respuestas activas de la intención resuelta y las envía en secuencia. Con dos respuestas activas, salen las dos.

## Goals / Non-Goals

**Goals:**

- Que el contenido compilado aterrice en el alcance correcto y que la pregunta que falte se cree.
- Que aprobar contenido retire lo que sustituye, sin borrar y sin decidir por el cliente.
- Que los turnos de la conversación objetivo se sostengan con contenido producido, no sembrado.

**Non-Goals:**

- La segunda desambiguación —"¿cuál te muestro?"— y las reglas de oferta. Van en la spec de desambiguación.
- La tabla del catálogo y las variables dentro de la prosa. Van en la spec de catálogo, y ahí se disuelve el problema de mantener coherentes la respuesta general y la del modelo.
- Limpiar las plantillas sembradas con marcadores sin llenar (`[X] modelos`, `[DIRECCIÓN EXACTA]`). Va en la spec de higiene, que es la siguiente.
- Cambiar el runtime de resolución. `resolveRows` ya hace lo correcto.

## Decisions

### El alcance destino se decide por los hechos, no por el árbol propuesto

El compilador ya atribuye cada hecho a un alcance: `assignRunToStructure` recibe un mapa de hecho a alcance, y la atribución por sujeto ya funciona. La decisión de dónde escribir una respuesta se toma mirando **qué hechos la sostienen**, que es el dato que ya existe y que además es el que se muestra como procedencia.

Alternativa descartada: decidir por la forma del árbol —"si el alcance tiene hijos, escribe en los hijos"—. Falla en el caso normal: un desarrollo con tres modelos también tiene datos propios, y la dirección no pertenece a ningún modelo.

Regla derivada, y es la que evita duplicar: si los hechos que sostienen una respuesta pertenecen a **varios** descendientes, la respuesta va al ancestro común. Una sola respuesta que habla del conjunto, no tres iguales.

### Crear la intención en el alcance destino, no reutilizar la de la raíz

`intent_configurations` tiene `scope_id` y una única clave por `(scope_id, intent_name)`. El modelo de datos ya soporta esto; nadie lo usa.

Se crea la intención en el alcance destino con el mismo `intent_name`. La resolución hacia arriba hace el resto: quien tenga la suya la usa, quien no, hereda.

Alternativa descartada: una intención por producto (`precio_solara`). Multiplica el catálogo de intenciones por el de productos, rompe la herencia y obliga al matcher a distinguir cosas que el lead nunca escribe. El lead escribe "precio"; de cuál es una decisión de foco, no de intención.

### Sustituir es desactivar con registro, nunca borrar

Aprobar contenido nuevo desactiva la respuesta que ocupaba ese lugar y deja constancia de que fue sustituida y por cuál. Borrar impediría revertir y perdería la única evidencia de qué decía el bot antes.

Alternativa descartada: dejar que convivan y elegir por prioridad al responder. Es lo que hay hoy, con `order_priority` empatado en 1, y el resultado es que se mandan las dos.

### Lo que ya existe se muestra; no se resuelve en una migración

Al aplicar el cambio habrá pares de pregunta y alcance con varias respuestas activas. La tentación es resolverlo en SQL con una regla —"gana la compilada"—.

No. Retirar de más deja al bot mudo en esa pregunta; retirar de menos deja el defecto. Y sobre todo: **reescribir contenido aprobado en una migración es lo que este proyecto se prohibió** al retirar los CTA sembrados de la 030. Se presentan juntas, con una propuesta de cuál conservar, y una persona confirma.

### La caché del árbol se invalida por versión, no por tiempo

`scope.repository.ts` sirve el árbol desde una caché en memoria con cinco minutos de vida, por proceso. `invalidateCache` solo alcanza al proceso que escribió, así que en un despliegue con varias instancias las demás siguen con el árbol viejo hasta que caduca por reloj.

Se detectó usándolo: tras sembrar el catálogo desde un script, el bot siguió ofreciendo los desarrollos anteriores. En local es una molestia; en producción es un reporte imposible de diagnosticar —"di de alta Altabrisa y el bot dice que no existe"— que para cuando alguien lo revisa ya funciona. Y el caso inverso es peor: un desarrollo agotado se sigue ofreciendo durante cinco minutos.

Alternativa descartada: bajar el TTL a treinta segundos. Es una línea y reduce la ventana, pero no la elimina, y paga más lecturas para seguir sin garantía.

La caché guarda además la versión del árbol con la que se llenó, y antes de usarla comprueba esa versión con una lectura barata. Coincide: sirve lo cacheado. No coincide: relee. La versión cambia al tocar el árbol.

Entra en este cambio y no en otro porque es aquí donde el árbol pasa a escribirse a menudo: cada aprobación de contenido puede crear una intención en un alcance. Sin esto, cada aprobación tendría su propia ventana de cinco minutos contestando lo anterior.

### Los seguimientos se convierten conservando el texto literal

`main` + `followup` pasan a ser dos fragmentos de una respuesta. La conversión copia el texto tal cual y conserva el orden; no es una oportunidad para mejorar la redacción. Si el texto es malo —y hay varios que lo son—, eso es de la spec de higiene, donde se ve y se aprueba.

## Risks / Trade-offs

- **Desactivar de más deja al bot sin respuesta a una pregunta que hoy contesta.** Es el riesgo mayor porque sale a leads reales. → Nada se desactiva sin confirmación humana; y la verificación incluye preguntar por cada intención existente antes y después, comprobando que ninguna se queda sin respuesta.
- **Crear intenciones automáticamente ensucia el catálogo.** Diez desarrollos con vocabularios distintos podrían generar decenas de intenciones casi iguales. → La intención se crea con el `intent_name` que ya usa el preset cuando la pregunta corresponde a una conocida; solo se inventa cuando el material sustenta algo genuinamente nuevo. Y el nombre entra en el catálogo visible, donde se puede fusionar o desactivar.
- **Una respuesta en un modelo y otra en el desarrollo pueden contradecirse.** El desarrollo dice "desde $1,850,000" y el modelo dice otra cifra. → Este cambio no lo resuelve; lo resuelve la spec de catálogo, calculando la general desde los hijos. Aquí se limita a no empeorarlo: la general se propone desde los hechos del propio alcance.
- **El compilador escribe en más sitios y una corrida a medias deja el árbol inconsistente.** Ya pasó esta semana con el alta de proyectos: un fallo a media lista dejó cuatro duplicados. → Lo que se cree en un mismo intento se deshace si el intento falla.

## Migration Plan

La migración de esquema, si hace falta, SHALL ser aditiva y aceptable por producción sin ajustes.

Ninguna migración desactiva contenido. La resolución de las colisiones existentes ocurre en la interfaz, con confirmación, y puede quedar pendiente indefinidamente sin romper nada: mientras no se confirme, el comportamiento es el de hoy.

Reversión: reactivar las respuestas desactivadas, que se conservan.

## Open Questions

Ninguna. Queda anotado para la spec de catálogo el caso de la cifra agregada del desarrollo, que aquí se propone desde los hechos propios y allí pasa a calcularse.
