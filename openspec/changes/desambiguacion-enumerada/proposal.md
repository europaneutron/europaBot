## Why

El compilador ya llena el catalogo: el bot de FYMSA contesta "que casas manejan", "cuanto cuesta" y "precio de Solara" desde el material. Lo que no sabe es **conversar cuando hay mas de una respuesta posible**, y ahi pierde al lead en el segundo turno.

Medido contra el bot publicado, con un lead nuevo:

```
lead: donde estan ubicados   -> [FALLBACK] No estoy seguro de entender tu pregunta.
lead: me interesa Europa     -> [FALLBACK] Disculpa, aun no logro comprender.
lead: donde estan ubicados   -> Permiteme conectarte con un asesor. ¿Podrias compartirme tu nombre?
lead: y el de Cala           -> Gracias y el de Cala. Registramos tu solicitud.
```

Cuatro turnos, ninguno contestado, el lead escalado a un asesor y su pregunta guardada como si fuera su nombre. Y no es que falte el contenido: `ubicacion` existe publicada en los dos desarrollos.

Son tres huecos distintos:

1. **Una pregunta que solo vive en las ramas es invisible sin foco.** La deteccion resuelve de foco hacia la raiz; sin foco solo ve la raiz. Como la direccion de Europa y la de Altabrisa son distintas, no hay `ubicacion` en la raiz, y la pregunta no existe para el bot. Deberia preguntar de cual, que es justo el caso en que preguntar tiene sentido.
2. **Mencionar un alcance a secas no significa nada.** "me interesa Europa" y "y el de Cala" no fijan foco ni recuperan la pregunta anterior.
3. **Cuando si pregunta, pregunta mal.** La desambiguacion sale como texto plano con guiones —no como botones, que el transporte ya soporta— y la respuesta que sigue mezcla las dos ramas: elegir "Residencial Europa" devuelve "Hay Vento desde $2,340,000, Cala desde $1,420,000, ...", con modelos de Altabrisa dentro.

Encima de eso, una oferta de si/no sigue siendo un callejon: `si` es palabra vacia del matcher fuera del flujo de cita, asi que "¿te muestro los modelos?" no tiene respuesta posible.

## What Changes

- La duda se resuelve **enumerando desde el catalogo**, no preguntando en abstracto: hasta 3 opciones van como botones, de 4 a 10 como mensaje de lista, y con mas de 10 hay que estrechar antes en vez de enumerar. El toque devuelve un identificador, no un titulo: en ese paso no hay coincidencia difusa.
- Se pregunta **al nivel donde las respuestas difieren**, y solo ahi. Con un solo desarrollo no se pregunta por desarrollo, pero si se baja al nivel siguiente si ahi hay duda.
- Se **contesta primero lo que si es cierto**: el rango general antes de la lista, no la pregunta sola.
- Una pregunta que **solo tiene respuesta en las ramas se detecta igual** sin foco, y su falta de respuesta en la raiz se resuelve preguntando de cual, no cayendo al fallback.
- **Mencionar un alcance a secas fija el foco y repite ahi la ultima pregunta.** "me interesa Europa" despues de "cuanto cuesta" contesta el precio de Europa. Sin pregunta previa, el alcance mencionado se presenta y ofrece su nivel siguiente.
- **Pedir otro es pedir los hermanos**: "¿y los demas?", "otro", "¿que mas tienen?" con foco puesto enumeran los hermanos del alcance en foco, no el catalogo entero.
- **Saludar suelta el foco.** Un saludo a mitad de conversacion empieza de nuevo: es la escotilla del lead para salir de una rama sin tener que nombrar otra.
- **Toda oferta deja constancia de que ofrecio**, y los afirmativos se resuelven contra esa oferta. Sin oferta viva, un "si" no cae al fallback generico: se responde "¿si a que?" con las opciones. Una respuesta que termina en pregunta de si/no sin declarar su oferta **no se puede publicar**.
- Una respuesta que abarca varias ramas **dice de quien es cada cosa**. Enumerar cinco modelos de dos desarrollos sin decir cual es de cual no es una respuesta: es una lista que el lead no puede usar.
- Las opciones se generan **desde el catalogo**. Los botones redactados a mano son un grafo de conversacion —destinos, ciclos, destino borrado— y quedan fuera a proposito.

## Capabilities

### New Capabilities
- `enumerated-disambiguation`: cuando el bot pregunta en vez de contestar, a que nivel pregunta, como enumera las opciones y como se lee la respuesta del lead.
- `pending-offer`: que una oferta quede registrada y que un afirmativo se resuelva contra ella, incluido el "¿si a que?" cuando no hay ninguna viva.

### Modified Capabilities
- `scope-routing`: la mencion de un alcance a secas fija foco y recupera la pregunta retenida; saludar lo suelta; una pregunta sin respuesta en la raiz se detecta y desambigua en vez de caer al fallback.
- `scoped-content`: una respuesta que abarca varias ramas nombra a que rama pertenece cada dato, y una respuesta que ofrece si/no declara su oferta para poder publicarse.

## Impact

- `src/core/conversation/message-processor.ts`: la desambiguacion deja de ser un mensaje de texto fijo y pasa por el catalogo; la mencion a secas y el saludo entran antes de la deteccion.
- `src/core/intent-engine/intent-detection.service.ts`: una intencion presente solo en ramas tiene que ser detectable sin foco.
- `src/data/repositories/scope-routing.repository.ts`: `isIntentScopeDependent` deja de responder si/no y pasa a decir **a que nivel** esta la duda.
- `src/services/whatsapp/`: `sendInteractiveButtons` ya existe; falta el mensaje de lista para 4 a 10 opciones.
- Base de datos: la oferta pendiente necesita donde vivir (junto a `pending_scope_question`, que ya guarda la pregunta retenida). Migracion aditiva.
- Compilador: la comprobacion previa a publicar gana dos reglas —una respuesta de si/no declara su oferta; una respuesta que cruza ramas las nombra.
- Pruebas: `scripts/simulate-fymsa.ts` es el criterio de aceptacion; los turnos 3, 4 y 9 de `openspec/conversacion-objetivo.md` son los que hoy fallan.
