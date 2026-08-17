## Context

El pipeline de conversación ya es ejecutable sin WhatsApp: `POST /api/test/process-message` recibe teléfono, mensaje, `scopeId` y `referralAdId`, corre `messageProcessor.processMessage` y devuelve la respuesta sin enviarla. Está bloqueado si `NODE_ENV === 'production'`. `POST /api/test/reset-user` limpia el estado de un número.

Lo que no existe es la pantalla. Hoy, para ver qué contesta el bot, hay que correr un script de `scripts/` en terminal. Leonardo no trabaja así, y esa es la razón concreta de que las tareas de verificación manual de `fragment-editor`, `document-compiler` y `onboarding-chat` se hayan saltado: la verificación existía como intención, no como algo que él pudiera hacer.

`scripts/simulate-fymsa.ts` demuestra que el diagnóstico que hace falta —alcance en foco, pregunta pendiente, si fue fallback— se puede leer de `user_sessions` y del resultado del procesador. La pantalla expone eso mismo.

## Goals / Non-Goals

**Goals:**

- Conversar con el bot real desde el navegador y ver por qué contestó lo que contestó.
- Que recorrer `openspec/conversacion-objetivo.md` sea algo que Leonardo hace solo, en minutos.
- Que los datos de una prueba no ensucien la operación.

**Non-Goals:**

- Cambiar cualquier comportamiento del bot. Si el simulador enseña algo feo, el arreglo va en otra spec.
- Reproducir la interfaz de WhatsApp. Basta que se lea como una conversación.
- Simular botones ni listas interactivas: hoy el bot no los manda. Cuando los mande, se amplía.
- Ejecutar la conversación objetivo de forma automatizada. Eso ya lo hace `scripts/simulate-fymsa.ts`; aquí se recorre a mano, que es justamente el punto.

## Decisions

### El simulador llama al procesador real, no a una copia

Alternativa descartada: reimplementar la selección de respuesta en el cliente para evitar tocar la base. Sería más rápido y no serviría para nada: la pantalla existe para detectar diferencias entre lo que creemos que hace el bot y lo que hace. Una copia solo puede confirmar lo que ya creemos.

Consecuencia aceptada: el simulador escribe en las mismas tablas que la operación. De ahí la decisión siguiente.

### El lead simulado se marca en el dato, no en la convención

Alternativa descartada: usar un prefijo de teléfono acordado y filtrarlo en cada pantalla. Es la clase de regla que se cumple donde alguien se acordó y se olvida en la consulta nueva; ya pasó con la configuración duplicada del asesor.

En su lugar, el usuario simulado lleva una marca explícita, y las lecturas de operación —listado de leads, métricas de calificación, seguimientos— la respetan. Que el marcado sea un dato y no un prefijo permite además que la comprobación sea una prueba y no una inspección.

Esto exige revisar qué lecturas hoy contarían un lead simulado. Es trabajo de esta spec, no de la siguiente: un simulador que ensucia los leads es peor que no tenerlo, porque el ensuciado se descubre tarde.

### El diagnóstico se muestra al lado, no dentro

El estado va como una nota adjunta al turno, no como un mensaje más. Si se intercala, la conversación deja de leerse como la leería un lead, y perder esa lectura es perder la mitad del valor: buena parte de lo que se detecta al usar el bot es que **suena mal**, no que esté técnicamente mal.

### La pantalla no inventa un formato de sesión propio

El estado que muestra sale de donde ya vive: el resultado de `processMessage` y la sesión del usuario. Si mañana se añade un dato de ruteo, la pantalla lo enseña porque lo lee de la fuente, no porque alguien se acuerde de propagarlo.

### Autenticación del panel, y bloqueo en producción por partida doble

Los endpoints de prueba ya se bloquean por `NODE_ENV`. La pantalla se bloquea también, y además exige sesión de administrador como el resto del dashboard. Dos cierres independientes para algo que ejecuta el procesador con un número arbitrario.

## Risks / Trade-offs

- **El simulador ensucia la base de revisión.** Ya ocurrió esta semana por otra vía: una prueba de integración dejó una corrida en `waiting_content_approval` y el panel mostraba un archivo de prueba con un precio inventado en lugar del desarrollo recién dado de alta. → El marcado explícito del lead simulado y el reinicio en un clic; y las lecturas de operación se revisan una por una en esta spec.
- **Se convierte en el único lugar donde se prueba, y deja de probarse lo demás.** → No sustituye a los scripts de `scripts/`; los complementa. El criterio de aceptación de las specs siguientes sigue siendo que `simulate-fymsa.ts` pase, y el simulador es cómo se mira lo que falla.
- **Da falsa sensación de fidelidad.** El simulador no reproduce la latencia de WhatsApp, ni las pausas entre fragmentos, ni el orden real de entrega. → La pantalla dice qué no reproduce, en vez de dejar que se asuma.

## Migration Plan

No hay migración de datos. Es una pantalla nueva sobre endpoints existentes.

Si las lecturas de operación necesitan filtrar leads simulados, el cambio de esquema SHALL ser aditivo y con valor por defecto que preserve el comportamiento actual, conforme a la regla del proyecto: producción debe poder aceptar la migración sin ajustes.

## Open Questions

Ninguna. Las decisiones de alcance —qué se simula y qué no— están cerradas arriba.
