## Context

Hoy todo mensaje entra por `messageProcessor.processMessage` (`src/core/conversation/message-processor.ts`) y pasa por cuatro etapas: ruteo de alcance (foco, alias, anuncio), resolución de ofertas pendientes, flujos activos (cita, captura del nombre para el asesor) y detección de intención con el matcher léxico. La respuesta sale de `bot_responses`, interpolada con `catalog_values` según el alcance y su herencia.

El webhook (`src/app/api/webhook/whatsapp/route.ts`) es síncrono: procesa, envía y después contesta 200 a Meta.

El contenido que el bot sabe está repartido en varias tablas, todas ya acotadas por el árbol de alcances:

| Qué | Dónde |
|---|---|
| Identidad del negocio | `client_brand_config` |
| Desarrollos y modelos | `scopes` |
| Datos comerciales | `catalog_values` (por alcance, con tipo `money`, `number`, etc.) |
| Respuestas redactadas | `bot_responses` |
| Temas y patrones | `intent_configurations` (`is_checkpoint`, `is_strong_signal`) |
| Brochures y archivos | `resources` |
| Asesor, horarios, puntos del score | `bot_config` |
| Horarios de cita | `appointment_config` y horarios por alcance |

`Bot_IA` (`~/ProyectosNext/Bot_IA`) es un bot de WhatsApp con modelo de lenguaje y RAG en producción para tres negocios. Sus reportes de conversaciones (septiembre y octubre de 2026) son la fuente principal de los riesgos de este diseño. Las decisiones que vienen de ahí citan el hallazgo correspondiente (H1 a H16, del resumen hecho para este cambio).

## Goals / Non-Goals

**Goals:**

- Contestar texto libre con naturalidad, recordando la conversación sin estado guardado.
- Que ninguna cifra, acción ni dato llegue al lead si el código no lo puede respaldar.
- Reutilizar el contenido, el flujo de cita, la derivación y la política de oferta tal como existen.
- Medir el efecto con una comparación limpia contra el bot léxico.
- Poder apagarlo en cualquier momento sin efectos.

**Non-Goals:**

- Botones en el camino con IA.
- Captar datos de calificación del lead.
- Retirar código del bot léxico.
- Separar entornos o tenants.

## Decisions

### D1. Bifurcación temprana, y los flujos activos siguen en el código actual

El camino con IA se decide al principio de `processMessage`, después de buscar al usuario y de verificar que el bot esté activo para él. Si hay un flujo activo, el mensaje sigue por el camino actual completo:
- flujo de cita en curso;
- respuesta de un WhatsApp Flow;
- captura del nombre para el asesor.

Esos flujos ya funcionan y son los que escriben en base de datos. Que la IA los interrumpa a medias abriría una clase entera de errores sin ganar nada. El modelo entra cuando no hay flujo, y la cita la arranca él con una tool. Rediseñar el flujo de cita con IA es otra idea registrada aparte, y no entra aquí.

*Alternativa descartada:* bifurcar después del ruteo de alcance. Obligaría al camino con IA a convivir con el foco, que es justo lo que se quiere dejar fuera.

### D2. Módulo nuevo `src/core/ai-conversation/`

Piezas separadas, una responsabilidad cada una:
- `context-builder`: arma el prompt desde los repositorios.
- `responder`: llamada al contestador con tools.
- `topic-classifier`: llamada al clasificador.
- `guards`: cifras, formato y evidencia.
- `ai-message-handler`: orquesta y decide el respaldo.

No importa de `app/` ni de `components/`. Todo acceso a Supabase pasa por `data/repositories/`. Devuelve el mismo `ProcessedResponse` que el camino actual, así que el webhook no cambia.

### D3. Modelo y configuración de las llamadas

| | Contestador | Clasificador |
|---|---|---|
| Modelo | `claude-haiku-5-5` | `claude-haiku-5-5` |
| Effort | `low` | `low` |
| Salida | Texto y tools | Estructurada (`output_config.format`) |
| `max_tokens` | Holgado (~2000): el largo lo controla la persona, no el corte | Pequeño |
| Tiempo límite | Configurable, 8 s por omisión | Configurable, menor |

El modelo y el effort viven en `bot_config` para poder cambiarlos sin desplegar. El paso a `claude-sonnet-5-5` se decide con el simulador (tarea 9), no por adelantado.

Haiku 5.5 no tiene respaldo automático del proveedor ante rechazos. Un rechazo (`stop_reason: "refusal"`) se trata como fallo y cae al bot léxico (D11).

*Por qué Haiku:* el trabajo es contestar sobre un catálogo chico y decidir cuándo llamar una tool. A $0.10/$0.50 por millón de tokens, cada mensaje cuesta una fracción de centavo, contra unos $0.02 con Sonnet. Además, una latencia menor importa en WhatsApp.

### D4. Orden y forma del prompt

El prompt de sistema es estable: cambia solo cuando cambia el contenido o la persona. Así se cachea. Va en este orden:

1. **Persona.** Va primero: en Bot_IA, moverla a la mitad subió las faltas de tono (H8).
2. **Capacidades.** Lo que el bot puede hacer, que son exactamente sus tools. Para todo lo demás está el asesor.
3. **Catálogo.** Cada dato con su ruta, por ejemplo `Europa > Solara > precio: $2,350,000`.
4. **Preguntas frecuentes.** Las respuestas de `bot_responses` ya interpoladas, agrupadas por ruta de alcance.

Lo variable va después del último punto de caché, como mensajes:
- historial reciente como turnos `user`/`assistant`;
- el mensaje del lead como `user`;
- el estado del turno como un mensaje `system` a media conversación: fecha y hora con zona horaria, origen del anuncio, si ya tiene cita, nota de oferta.

**Reglas de redacción del prompt, todas por hallazgos de Bot_IA:**
- **Hechos, no prohibiciones** (H1). No hay listas de "NUNCA". Cada regla dice lo que sí ocurre: "cierra con lo que sigue", no "nunca preguntes ¿algo más?".
- **Ninguna frase literal dictada** (H3). Una frase literal en un nivel alto se repite fuera de contexto.
- **Sin ejemplos con huecos ni con datos reales** (H2). Si hace falta un ejemplo de formato, va como texto, con nombres inventados, y nunca como un turno `user`/`assistant`.
- **El lector se define una vez:** un interesado en una vivienda, leyendo en WhatsApp.

*Alternativa descartada:* niveles de autoridad numerados, como en Bot_IA. Aquí no hacen falta: el contenido es del negocio, nadie de fuera escribe en el prompt, y el texto del lead viaja en su propio rol.

### D5. Separación de roles contra la inyección de instrucciones

El texto del lead nunca se concatena al prompt de sistema. La API distingue `system`, `user` y `assistant`, y esa separación es la primera defensa.

La segunda es más fuerte: el modelo no puede hacer nada que las tools no permitan, y lo que dice pasa por las guardas.

No se agrega filtro de entrada por palabras. En Bot_IA bloqueaba frases inocentes como "a partir de ahora". El peor caso realista es una respuesta extraña en el chat de quien la provocó.

### D6. Exclusión de contenido en código, no en el prompt

El `context-builder` interpola cada respuesta con el mismo `interpolateMessage` de hoy y descarta:
- las que quedan con huecos sin resolver (`complete === false`);
- las que tienen marcadores de plantilla (`[X]`, `[XX]`, `$XXX`, corchetes con texto en mayúsculas);
- las vacías;
- las marcadas como navegación.

Para marcar navegación se agrega un indicador en la respuesta. Al principio lo fija el administrador. Una heurística (respuesta corta que termina en "¿cuál…?" sin datos) solo propone candidatas en el registro: no las marca sola.

En Bot_IA, el modelo filtró al lead una plantilla con corchetes (H2) y obedeció un documento que le hablaba al bot (H7). Pedirle al modelo que ignore algo no funciona: hay que quitarlo antes.

### D7. Sin foco: el desarrollo es un parámetro

El árbol se usa para ordenar el contexto y heredar datos, nada más. Las tools que necesitan un desarrollo lo piden como un `enum` armado con los nombres de los alcances activos, con `strict: true`. El código vuelve a validar el valor contra los alcances activos, porque el `enum` del esquema puede quedar viejo entre la carga y la llamada.

Con un solo desarrollo activo, el parámetro se llena en código y no se le pide al modelo.

El origen del anuncio (`scope_ads`) se sigue leyendo como hoy, pero entra al turno como un hecho ("llegó por el anuncio de Europa"), no como estado.

### D8. Tools del contestador

| Tool | Parámetros | Llama a |
|---|---|---|
| `agendar_visita` | `desarrollo` | `appointmentManager.startFlow` o `startFlowViaWhatsAppFlow`, según `APPOINTMENT_FLOW_MODE` |
| `hablar_con_asesor` | `desarrollo` (opcional) | `fallbackHandler.startDerivation` |
| `enviar_brochure` | `desarrollo` | `resourceRepository.getVisible` y el envío actual de recursos |

Cuando el contestador llama a `agendar_visita` o `hablar_con_asesor`, el turno lo termina el flujo: se manda el mensaje que devuelve el flujo y no se pide más texto al modelo. Es el mismo mensaje que hoy, y evita que cuatro fuentes escriban en el mismo turno (H15).

El resultado de cada tool se le devuelve al modelo como hecho ("el brochure se envió" o "no hay brochure para Altabrisa"). Así el modelo no afirma lo que no pasó (H14).

El loop de tools tiene un tope bajo, dos rondas, porque ninguna tarea del bot necesita más.

### D9. Clasificador en paralelo, con evidencia y claridad

**Entrada:** el mensaje del lead, los dos turnos anteriores (para referencias como "esa") y la lista de temas. Para cada tema se dan su nombre, una descripción corta y algunos patrones de `intent_configurations` como ejemplos de cómo se pregunta.

**Salida estructurada:**

```
temas: [{ tema: enum, cita: string, claridad: "clara" | "dudosa", desarrollo: enum | "general" }]
otro_tema: string | null
```

**Validación en código, en este orden:**
1. El tema existe y está activo.
2. La cita aparece en el mensaje. Se normaliza igual que `normalizeVariableKey`: sin acentos, en minúsculas, con espacios colapsados.
3. La cita no es solo un saludo o un afirmativo. Se reutiliza `affirmative-phrases.ts`.
4. El desarrollo existe.

*Por qué no un número de confianza:* un modelo que reporta su propia confianza da valores altos casi siempre, y eso no sirve como umbral. La cita textual es verificable y atrapa la invención. La claridad en dos niveles atrapa lo irrelevante, el caso que la cita sola no cubrió en Bot_IA (el "falso diferido" con la cita "Hola").

*Por qué separado del contestador:* una sola llamada con varias obligaciones (contestar, marcar, ofrecer) hace que compitan (H15). Si el registro fuera una tool opcional, el modelo a veces la omitiría. En paralelo no suma latencia.

### D10. Score por lead y por tema

Se escribe en `user_checkpoints` como hoy. El `scope_id` va en el alcance raíz, para que la regla "una vez por tema" la cumpla la restricción existente. El desarrollo mencionado se guarda en una columna nueva. El score se calcula con el mismo `LeadScorer` sobre la raíz, con los mismos puntos y umbrales de `bot_config`.

`shouldOfferAppointment` no cambia. Recibe el conteo de temas claros, la señal fuerte (`is_strong_signal` de los temas detectados), si ya se ofreció y el enfriamiento. Se evalúa con el resultado del clasificador. Si el clasificador no termina a tiempo, la oferta se evalúa con lo que ya había guardado.

Mientras el clasificador no pase la calibración (tarea 8), la fuente del score es el matcher, ejecutado sobre el mismo mensaje. El cambio de fuente es una clave de `bot_config`.

### D11. Guardas de salida y respaldo

**Cifras.** Se extraen las cantidades de dinero de la respuesta y se normalizan: `$2,350,000`, `2.35 millones` y `2,350 mil` son la misma. Se comparan contra todos los valores `money` del catálogo, con una tolerancia de redondeo para expresiones en millones.

- **Fase 1:** basta con que la cifra exista en el catálogo.
- **Si el simulador muestra cifras correctas atribuidas al modelo equivocado:** se endurece a que la cifra pertenezca al alcance nombrado en la misma oración.

**Formato.** Una función pura convierte el markdown al formato de WhatsApp: enlaces a "texto: url", sin encabezados ni tablas, y `**negritas**` a `*negritas*`. No se confía en el modelo para esto: en Bot_IA, al bajar la regla de autoridad subieron los enlaces mal formados (H9).

**Respaldo.** Hay respaldo ante cualquiera de estas causas:
- tiempo agotado;
- error de la API, incluida la falta de crédito;
- rechazo del modelo;
- cifra inválida tras un reintento;
- respuesta vacía.

En todos los casos, el mismo mensaje se procesa con el camino léxico completo y se registra la causa. En Bot_IA una caída se veía como "no tengo información" y nadie la detectaba (H16).

### D12. Historial, procesamiento único y webhook síncrono

El historial son los últimos 10 mensajes de `conversations`, convertidos a turnos `user`/`assistant`. Los mensajes consecutivos del mismo rol se unen.

Antes de procesar se busca `message_id` en `conversations`. Si ya existe, no se contesta. Esto ya hace falta hoy, y con un modelo más lento sube la probabilidad de que Meta reintente.

El webhook se queda síncrono en esta fase. Con un tiempo límite de 8 s y el respaldo, el peor caso sigue dentro de la ventana de Meta. Pasar a contestar 200 de inmediato y procesar después (`waitUntil`) se decide con la latencia medida, no antes.

### D13. Persona en `bot_config`

Las claves son:
- `ai_persona_name`;
- `ai_persona_register` (`tu` o `usted`);
- `ai_persona_emojis` (`si`, `pocos` o `no`);
- `ai_persona_length` (`corta` o `media`);
- `ai_persona_notes`, texto libre, con un límite de caracteres.

Viven en `bot_config` y no en una tabla nueva, porque ya tiene alcance por `scope_id`, herencia y pantalla de Ajustes.

El `context-builder` convierte los campos en frases de hecho. Por ejemplo: "Hablas de tú. Usas emojis con moderación, como lo haría un asesor en WhatsApp."

La política de admitir que es un asistente es fija, no un campo: el negocio no puede configurar que el bot niegue ser un bot.

El panel muestra una advertencia si las notas contienen "nunca", "jamás" o "prohibido". No las bloquea: avisa que una prohibición tiende a provocar lo que prohíbe.

### D14. Medición con frases reales

Las frases de prueba salen del respaldo local `backups/prod_backup_data_20260831_173131.sql`. Un script extrae solo `message_text` de los mensajes entrantes, sin teléfonos, nombres ni identificadores, y los escribe en un fixture fuera de `backups/`.

Esos textos se usan para tres cosas:
- el simulador del contestador: corridas de conversación con frases reales;
- la calibración del clasificador: una muestra de 100 etiquetada a mano, como ejemplos;
- la regresión: cada cambio al prompt se corre de nuevo.

Bot_IA tuvo dos regresiones con más de 900 tests verdes que solo detectó el simulador. Por eso aquí el simulador es el criterio, no los tests unitarios.

### D15. Preparado para índice más consulta, sin activarlo

El `context-builder` arma el catálogo por desarrollo en bloques independientes. Si en el futuro se activa el modo de índice, cada bloque es la respuesta de una tool `consultar_desarrollo(nombre)`, una consulta exacta por nombre y no por similitud. El tamaño del contexto se registra en cada llamada (requisito de registro). El umbral para activarlo, unos 60,000 tokens o cruces de datos medidos en el simulador, se decide con esos registros.

## Risks / Trade-offs

- **El modelo cruza datos entre modelos o desarrollos.** Es el riesgo principal con contenido parecido. → Cada dato lleva su ruta completa. La guarda de cifras atrapa lo inventado, pero no el cruce entre valores reales; el simulador mide el cruce con preguntas que comparan modelos, y si aparece se endurece la guarda (D11).
- **Respuestas existentes escritas como mensaje y no como información.** Sus cierres ("¿te muestro los planos?") pueden copiarse. → Se excluyen las de navegación y se mide en el simulador cuántas respuestas terminan en una pregunta del contenido. Con el tiempo, el contenido nuevo se escribe como ficha.
- **El score sube por cambiar de detector, no por más interés.** → La señal del matcher se registra en paralelo (requisito de topic-classification), así que cada lead se puede comparar con los dos detectores.
- **Latencia de 2 a 5 s por mensaje.** → Haiku con effort bajo, caché del prompt, indicador de "escribiendo" ya existente y tiempo límite con respaldo.
- **Costo descontrolado por un número que manda mensajes sin parar.** → Límite configurable de mensajes por teléfono y por hora. Al superarlo, el número pasa al bot léxico.
- **El contexto deja de caber en caché por un detalle variable.** → Nada con fecha, hora ni identificadores en el prompt de sistema. Todo eso va en el mensaje de turno, y se verifica `cache_read_input_tokens` en el registro.
- **Contradicción con decisiones anteriores** ("el runtime no lleva LLM"). → La proposal lo declara y la tarea 1 actualiza `conversacion-objetivo.md` y la memoria del proyecto.
- **Bot_IA sigue con problemas sin resolver.** Recuperación del RAG, falso diferido, guardián permisivo. → No se heredan: aquí no hay búsqueda por similitud, no hay campos diferidos y las guardas bloquean, no solo registran.

## Migration Plan

1. Migraciones aditivas: claves de `bot_config`, registro de llamadas, salida del clasificador y desarrollo en `user_checkpoints`. Con el interruptor apagado no cambia ningún comportamiento.
2. Construcción y medición en local con el simulador y `/api/test/process-message`.
3. Etapa de WhatsApp real, cuando exista la separación de entornos (fuera de este cambio): Supabase de staging con contenido copiado sin datos personales, App de Meta de prueba y variables de Preview en Vercel.
4. Producción con el interruptor apagado.
5. Encendido para la lista de teléfonos del equipo.
6. Encendido para un anuncio o un porcentaje, comparando contra la línea base del respaldo: hot, warm, mediana de mensajes, porcentaje que se va tras un mensaje.

**Reversa:** apagar el interruptor. El bot léxico no se modificó, y el historial y los checkpoints escritos por el camino con IA siguen siendo válidos para él.

## Open Questions

- **Umbral de precisión del clasificador.** Queda en 90% por omisión. Se confirma al ver la primera medición.
- **Cómo se marca una respuesta como navegación en el panel.** Un indicador por respuesta, o una lista que propone la heurística y el administrador acepta. Se decide al hacer la tarea correspondiente, mostrando las candidatas reales.
- **Límite de mensajes por teléfono y por hora.** Hace falta un valor inicial. Propuesta: 30.
