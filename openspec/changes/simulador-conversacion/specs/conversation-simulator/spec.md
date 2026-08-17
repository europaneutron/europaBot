## ADDED Requirements

### Requirement: Conversar con el bot desde el panel

El sistema SHALL ofrecer una pantalla donde una persona escriba mensajes como si fuera un lead de WhatsApp y reciba las respuestas del bot, sin enviar nada por WhatsApp.

Las respuestas SHALL provenir del procesador de mensajes real. La pantalla no SHALL contener lógica de conversación propia: si el bot cambia, la pantalla refleja el cambio sin tocarse.

#### Scenario: Un mensaje recibe la respuesta real del bot

- **WHEN** la persona escribe "¿cuánto cuestan?" en el simulador
- **THEN** recibe exactamente el mismo texto que recibiría un lead por WhatsApp
- **AND** no se envía ningún mensaje por WhatsApp

#### Scenario: Una respuesta de varios mensajes se ve como varios mensajes

- **WHEN** la respuesta del bot está compuesta por varios fragmentos
- **THEN** la pantalla los muestra como mensajes separados, en el orden en que se enviarían

#### Scenario: El contenido nuevo se refleja sin tocar el simulador

- **WHEN** se aprueba una respuesta nueva en el panel de contenido
- **AND** la persona vuelve a preguntar lo mismo en el simulador
- **THEN** recibe la respuesta nueva

### Requirement: Ver por qué el bot contestó eso

Cada turno SHALL mostrar, junto a la respuesta, el estado con el que el bot decidió: el alcance en foco, la intención detectada, si la respuesta fue un fallback, y si quedó una pregunta pendiente de desambiguación.

Este estado SHALL presentarse como información de diagnóstico separada de la conversación, de modo que la conversación se lea como la leería un lead.

#### Scenario: El alcance en foco se muestra en cada turno

- **WHEN** la persona escribe "Solara" y el bot fija el foco en ese modelo
- **THEN** el turno indica que el alcance en foco es "Modelo Solara"

#### Scenario: Un fallback se distingue de una respuesta

- **WHEN** el bot no reconoce la intención y responde con el mensaje de fallback
- **THEN** el turno queda marcado como fallback
- **AND** la respuesta se distingue visualmente de una respuesta reconocida

#### Scenario: Una pregunta pendiente se hace visible

- **WHEN** el bot pregunta de cuál desarrollo se trata y retiene la pregunta original
- **THEN** el turno muestra cuál es la pregunta que quedó pendiente

#### Scenario: El diagnóstico no se confunde con la conversación

- **WHEN** la persona lee la pantalla
- **THEN** puede seguir la conversación de arriba abajo sin que el diagnóstico se intercale como si fueran mensajes del bot

### Requirement: Reiniciar el lead simulado

El sistema SHALL permitir descartar el estado del lead simulado en una acción, de modo que la siguiente conversación empiece sin foco, sin preguntas pendientes, sin historial y sin progreso de calificación.

#### Scenario: Reiniciar borra el foco

- **WHEN** el lead simulado tiene el foco en "Modelo Solara"
- **AND** la persona reinicia
- **THEN** el siguiente mensaje se procesa sin foco previo

#### Scenario: Reiniciar borra la conversación visible

- **WHEN** la persona reinicia
- **THEN** la pantalla queda vacía y el historial anterior no se mezcla con la conversación nueva

#### Scenario: Reiniciar no toca a otros leads

- **WHEN** la persona reinicia el lead simulado
- **THEN** ningún otro usuario de la base pierde su estado

### Requirement: El lead simulado es desechable y distinguible

Los datos que genere el simulador SHALL ser reconocibles como simulación en el resto del sistema, y no SHALL contaminar la operación real.

Un lead simulado no SHALL aparecer entre los leads del panel como si fuera una persona real, ni SHALL sumar a métricas de calificación, ni SHALL disparar seguimientos programados.

#### Scenario: Un lead simulado no aparece como lead real

- **WHEN** la persona conversa en el simulador hasta calificar
- **AND** abre la pantalla de leads
- **THEN** el lead simulado no se cuenta entre los leads reales

#### Scenario: Un lead simulado no genera seguimientos

- **WHEN** una conversación simulada llega a un punto que programaría un seguimiento
- **THEN** no se programa ningún envío a ese número

#### Scenario: Elegir con qué lead se prueba

- **WHEN** la persona quiere probar dos conversaciones sin que se interfieran
- **THEN** puede usar leads simulados distintos, cada uno con su propio estado

### Requirement: Reproducir la entrada desde un anuncio

El sistema SHALL permitir simular que el lead llega desde un anuncio Click-to-WhatsApp, indicando el identificador del anuncio antes de enviar el primer mensaje.

#### Scenario: Un anuncio conocido fija el alcance

- **WHEN** la persona indica el identificador de un anuncio asociado a un desarrollo activo
- **AND** envía el primer mensaje
- **THEN** el turno muestra que el foco quedó en ese desarrollo por procedencia del anuncio

#### Scenario: Un anuncio desconocido no rompe la conversación

- **WHEN** la persona indica un identificador de anuncio que no corresponde a ningún alcance
- **THEN** la conversación continúa sin foco por procedencia, como lo haría en producción

### Requirement: No disponible en producción

El simulador SHALL estar bloqueado en producción, igual que los endpoints de prueba que utiliza.

#### Scenario: La pantalla no se sirve en producción

- **WHEN** se accede al simulador en un despliegue de producción
- **THEN** no se sirve la pantalla

#### Scenario: Solo para personas autenticadas

- **WHEN** alguien sin sesión de administrador intenta usar el simulador en un entorno donde sí está disponible
- **THEN** no puede enviar mensajes ni leer respuestas

### Requirement: Recorrer la conversación objetivo

El simulador SHALL permitir recorrer completos los turnos de `openspec/conversacion-objetivo.md` y observar en pantalla, sin recurrir a la terminal, cuáles se cumplen y cuáles no.

#### Scenario: Los turnos que hoy fallan se ven fallar

- **WHEN** la persona recorre la conversación objetivo con el catálogo de FYMSA sembrado
- **AND** llega al turno donde escribe solo "Solara"
- **THEN** ve la respuesta de fallback y, junto a ella, que el foco sí quedó en "Modelo Solara" y que no había pregunta pendiente
