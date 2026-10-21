## 1. Preparación

- [x] 1.1 Crear la rama `feat/conversacion-con-ia` y levantar el stack local (`supabase start`). Verificar los grants según `AGENTS.md`
- [x] 1.2 Actualizar `openspec/conversacion-objetivo.md`: el camino con IA usa los mismos turnos como criterio, y se acepta prosa sin botones donde el documento muestra botones. Quitar "el runtime no lleva LLM" del apartado fuera de alcance y explicar por qué se revisó la decisión
- [x] 1.3 Agregar `ANTHROPIC_API_KEY` a `.env.example` y a `.env.development.local`. Instalar `@anthropic-ai/sdk`
- [x] 1.4 Registrar la línea base local: correr `scripts/simulate-fymsa.ts` con el interruptor apagado y guardar el resultado, para comprobar después que el camino léxico no cambió

## 2. Frases reales para medir

- [x] 2.1 Script `scripts/extract-real-phrases.ts`: lee el respaldo local, extrae solo `message_text` de mensajes entrantes, sin teléfonos, nombres ni identificadores, quita duplicados y escribe un fixture en `scripts/fixtures/`. El fixture queda fuera de git, igual que `backups/`
- [x] 2.2 Revisar a mano una muestra del fixture para confirmar que no quedan datos personales dentro del texto (teléfonos, correos, nombres propios escritos por el lead) y enmascararlos si aparecen

## 3. Esquema

- [x] 3.1 Migración aditiva con las claves de `bot_config`:
  - interruptor del camino con IA;
  - modelo y effort del contestador y del clasificador;
  - tiempos límite;
  - fuente del score (`matcher` o `classifier`);
  - límite de mensajes por teléfono y por hora;
  - campos de la persona.

  Valores por omisión: apagado, y el score con el matcher
- [x] 3.2 Tabla de registro de llamadas al modelo: modelo, tokens (entrada, caché, salida), latencia, tools, guardas que actuaron, causa de respaldo y tamaño del contexto. Con RLS y políticas para `service_role` y `authenticated`
- [x] 3.3 Tabla de salida del clasificador por mensaje: temas con cita, claridad y desarrollo, otro tema, temas descartados con su causa, y temas que detectó el matcher. Con RLS
- [x] 3.4 Columna de desarrollo mencionado en `user_checkpoints`, nula por omisión
- [x] 3.5 Indicador de navegación en `bot_responses`, falso por omisión
- [x] 3.6 Verificar que la secuencia completa de migraciones corre desde cero con `supabase db reset`

## 4. Armado del contexto

- [x] 4.1 Repositorio: leer en una sola pasada el árbol activo con su catálogo, sus respuestas y sus recursos, respetando la versión del árbol (`withContentVersionScope`)
- [x] 4.2 `context-builder`: persona, capacidades, catálogo con ruta completa por dato y preguntas frecuentes interpoladas, en ese orden y con texto determinista, para que el prefijo se cachee
- [x] 4.3 Exclusiones: huecos sin resolver, marcadores de plantilla, respuestas vacías y de navegación. Se registra lo excluido con su causa
- [x] 4.4 Persona: convertir los campos guiados en frases de hecho, con la política fija de admitir que es un asistente
- [x] 4.5 Mensaje de turno: fecha y hora con zona horaria, origen del anuncio, si tiene cita activa y la nota de oferta cuando aplique
- [x] 4.6 Script `scripts/test-ai-context.ts`: arma el contexto del caso FYMSA local y verifica rutas completas, herencia, exclusiones y que dos armados seguidos producen el mismo texto byte por byte

## 5. Contestador

- [x] 5.1 Cliente de Anthropic en `src/services/`, configurado desde `bot_config`, con tiempo límite y manejo de errores por tipo de excepción del SDK
- [x] 5.2 Tools `agendar_visita`, `hablar_con_asesor` y `enviar_brochure`, con `desarrollo` como `enum` de alcances activos y `strict: true`. Validar de nuevo en código y llenar solo con un único desarrollo
- [x] 5.3 Loop de tools de dos rondas como máximo. Cita y asesor terminan el turno con el mensaje del flujo. El resultado de cada tool vuelve al modelo como hecho
- [x] 5.4 Historial: últimos 10 mensajes de `conversations` como turnos, uniendo los consecutivos del mismo rol
- [x] 5.5 Procesamiento único por `message_id` antes de llamar al modelo
- [x] 5.6 Registro de cada llamada en la tabla de la tarea 3.2

## 6. Guardas y respaldo

- [x] 6.1 Extracción y normalización de cifras de dinero (`$2,350,000`, `2.35 millones`, `2,350 mil`) y comparación contra los valores `money` del catálogo
- [x] 6.2 Conversión de formato para WhatsApp como función pura, registrando las correcciones
- [x] 6.3 Respaldo al camino léxico ante tiempo agotado, error de API, rechazo del modelo, cifra inválida tras un reintento o respuesta vacía, registrando la causa
- [x] 6.4 Límite de mensajes por teléfono y por hora, que manda al camino léxico al superarse
- [x] 6.5 Script `scripts/test-ai-guards.ts`:
  - cifras válidas, inventadas y en otros formatos;
  - markdown;
  - cada causa de respaldo simulada sin llamar a la API.

## 7. Clasificador de temas

- [x] 7.1 Llamada con salida estructurada: lista de temas (puede venir vacía), cita, claridad, desarrollo y otro tema. Recibe los temas con descripción y ejemplos de `intent_configurations`
- [x] 7.2 Validación en código: tema activo, cita presente con normalización, cita que no sea solo saludo o afirmativo, desarrollo existente
- [x] 7.3 Ejecución en paralelo con el contestador. Si falla, el mensaje se registra sin temas y la respuesta no se retrasa
- [x] 7.4 Ejecutar también el matcher sobre el mismo mensaje y registrar sus temas sin sumarlos
- [x] 7.5 Escritura de checkpoints en el alcance raíz con el desarrollo mencionado, solo para temas claros y solo si la fuente del score es el clasificador. Recalcular con `LeadScorer`
- [x] 7.6 Script `scripts/test-topic-classifier.ts`:
  - mensaje sin tema;
  - pregunta sin palabras de los patrones;
  - varios temas;
  - otro tema;
  - cita inventada;
  - cita "Hola";
  - "sí" a una oferta del bot.

## 8. Calibración del clasificador

- [x] 8.1 Script que corre el clasificador y el matcher sobre 300 frases del fixture y genera una hoja para etiquetar a mano 100 de ellas
- [ ] 8.2 Etiquetado a mano de la muestra (lo hace Leonardo)
- [ ] 8.3 Calcular precisión y cobertura de los temas claros contra el etiquetado, para el clasificador y para el matcher. Registrar el resultado en este cambio
- [ ] 8.4 Si la precisión de los temas claros alcanza el umbral, documentar la decisión de cambiar la fuente del score. Si no, iterar la descripción de los temas y volver a medir

## 9. Integración en el procesador

- [x] 9.1 Bifurcación en `processMessage`, después de verificar que el bot esté activo: camino con IA si el interruptor está encendido y no hay un flujo activo (cita, WhatsApp Flow o captura del nombre para el asesor). En cualquier otro caso, camino actual sin cambios
- [x] 9.2 Evaluar `shouldOfferAppointment` antes de llamar al contestador, con el conteo de la fuente vigente. Marcar la oferta con la persistencia actual
- [x] 9.3 Verificar que el camino con IA no lee ni escribe foco, pregunta retenida ni oferta pendiente
- [x] 9.4 Verificar con `/api/test/process-message` que el camino con IA devuelve el mismo `ProcessedResponse` que el webhook ya sabe enviar
- [x] 9.5 Repetir la línea base de la tarea 1.4 con el interruptor apagado y confirmar que no cambió

## 10. Persona en Ajustes

- [x] 10.1 Sección de persona en el panel de Ajustes, con nombre, tratamiento, emojis, largo y notas con límite de caracteres
- [x] 10.2 Advertencia, sin bloqueo, cuando las notas contienen "nunca", "jamás" o "prohibido"
- [x] 10.3 Vista previa del texto de persona que recibirá el modelo

## 11. Simulador y aceptación

- [x] 11.1 Extender el simulador para correr el camino con IA: conversación objetivo FYMSA, escenas complementarias y conversaciones armadas con frases reales del fixture
- [x] 11.2 Casos de riesgo:
  - comparar precios entre modelos y desarrollos (cruce de datos);
  - "¿eres un bot?";
  - intento de inyección;
  - pedir código o temas ajenos;
  - "sí" tras la oferta de cita;
  - "quiero agendar" sin desarrollo claro.
- [x] 11.3 Correr cada caso al menos dos veces y registrar el resultado en `openspec/changes/conversacion-con-ia/evidencia/`
- [x] 11.4 Comparar Haiku 5.5 y Sonnet 5.5 sobre el mismo conjunto. Documentar costo, latencia y fallas, y decidir el modelo
- [ ] 11.5 Confirmar que todos los turnos de la conversación objetivo pasan con el modelo elegido, sin cifras fuera del catálogo

## 12. Cierre

- [ ] 12.1 Actualizar `AGENTS.md`: el camino con IA, dónde vive, las guardas y que ningún cambio al prompt se da por bueno sin correr el simulador
- [ ] 12.2 Documentar en este cambio los pasos de la etapa de WhatsApp real (Supabase de staging, App de Meta de prueba, variables de Preview), que quedan como cambio aparte
