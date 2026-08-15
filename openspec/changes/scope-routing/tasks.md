## 1. Preparación

- [x] 1.1 Mapear y documentar en `design.md`, antes de escribir código, qué determina hoy el alcance en cada ruta que lo recibe, y qué pasaría a determinarlo. Es el paso que evitó rondas de revisión en el cambio anterior
- [x] 1.2 Leer las decisiones ya cerradas en `design.md` sobre caducidad del foco, anuncio hacia alcance inactivo y alias ambiguo. No quedan preguntas abiertas que resolver
- [x] 1.3 Extender la línea base para que cubra el comportamiento con un solo alcance activo a través de todas las rutas nuevas, y registrarla antes de tocar código

## 2. Esquema

- [x] 2.1 Migración aditiva con la asociación de anuncios a alcances, con RLS y políticas para `service_role` y `authenticated`
- [x] 2.2 Alias por alcance, con la restricción que se haya decidido en la tarea 1.2 para el caso ambiguo
- [x] 2.3 Foco y foco previo en `user_sessions`, y alcance en `conversations`
- [x] 2.4 Verificar que la secuencia completa de migraciones corre desde cero sin error

## 3. Origen del mensaje

- [x] 3.1 Extender `extractMessage` para conservar el identificador del anuncio cuando el mensaje se origina en uno, sin alterar el resto del contrato
- [x] 3.2 Propagar ese origen desde el webhook hasta el procesador de mensajes
- [x] 3.3 Registrar el anuncio de origen asociado a la conversación, para poder atribuir el lead a la campaña
- [x] 3.4 Verificar con cargas útiles representativas: mensaje con anuncio conocido, con anuncio no asociado, y sin anuncio

## 4. Foco de la conversación

- [x] 4.1 Resolver el alcance de cada mensaje según la precedencia definida: anuncio de origen, mención explícita, foco previo, raíz
- [x] 4.2 Persistir el foco y el foco previo en la sesión
- [x] 4.3 Partir de ese foco en la detección de intención y en la resolución de contenido, en lugar de asumir la raíz
- [x] 4.4 Registrar el alcance en cada mensaje de la conversación
- [x] 4.5 Verificar continuidad del foco entre mensajes y su conservación tras un periodo sin actividad

## 5. Cambio de foco por mención

- [x] 5.1 Reconocer alias de alcance reutilizando el matcher léxico existente, con tolerancia a errores de escritura
- [x] 5.2 Cambiar el foco ante una mención explícita, incluso hacia un alcance que no sea hijo inmediato de la raíz
- [x] 5.3 No cambiar el foco ante el alias de un alcance inactivo
- [x] 5.4 Verificar que cambiar de foco no altera el estado asociado al alcance anterior
- [x] 5.5 No cambiar el foco ante un alias que pertenece a más de un alcance activo, y dejar constancia de la ambigüedad

## 5b. Caducidad y desambiguación

- [x] 5b.1 Caducar el foco tras 24 horas de inactividad, sin afectar el historial del lead ni su relación con los alcances por los que preguntó
- [x] 5b.2 Determinar, a partir de la distribución del contenido, cuándo una intención depende del alcance: varios alcances activos definen contenido propio para ella
- [x] 5b.3 Pedir al lead que indique el desarrollo cuando esa condición se cumple y no hay foco, en lugar de responder con un contenido arbitrario
- [x] 5b.4 Retener la pregunta original y responderla una vez establecido el foco, sin obligar al lead a repetirla
- [x] 5b.5 No desambiguar nunca cuando existe un solo alcance activo

## 6. Mensajes y saludo compuesto

- [x] 6.1 Implementar la interpolación de variables en un único lugar, compartido por los mensajes de sistema y por las respuestas de intenciones. Hoy la de respuestas está pendiente como `TODO` en `conversation.repository.ts` y la de mensajes de sistema se hace con reemplazos sucesivos en cada manejador
- [x] 6.1b Sembrar por migración los mensajes de desambiguación y de presentación de alcances, siguiendo el patrón de la migración 011: texto por defecto utilizable, editable desde el dashboard, con sus variables documentadas en la descripción
- [x] 6.2 Componer el saludo con los alcances activos disponibles
- [x] 6.3 No plantear elección cuando hay un solo alcance activo o cuando el foco ya está determinado por el anuncio
- [x] 6.4 Verificar que activar un alcance nuevo lo incorpora al saludo sin editar textos

## 7. Verificación

- [x] 7.1 Confirmar que con un solo alcance activo la línea base es idéntica, incluyendo saludo, detección, respuestas, recursos y configuración
- [x] 7.2 Escenario extremo a extremo con dos alcances: lead que llega por anuncio de uno, cambia de foco nombrando el otro, y vuelve al primero
- [x] 7.3 Verificar mediante `POST /api/test/process-message` la resolución desde cada alcance
- [x] 7.4 Verificar el comportamiento ante un anuncio sin asociación, ante un anuncio que apunta a un alcance inactivo, y ante un alias que pertenece a varios alcances
- [x] 7.7 Verificar la caducidad del foco: regreso dentro de la ventana conserva foco, regreso posterior lo redetermina, y el historial permanece intacto en ambos casos
- [x] 7.8 Verificar la desambiguación extremo a extremo: pregunta dependiente del alcance sin foco, respuesta del lead, y contestación de la pregunta original sin repetirla
- [x] 7.5 Confirmar `tsc --noEmit` limpio y sin emojis nuevos, conforme a `AGENTS.md`
- [x] 7.6 Dejar anotado en el cambio qué debe verificarse en el esquema remoto antes de aplicar en producción

## 8. Correcciones de la revisión

- [x] 8.1 Ofrecer solo las ramas activas de primer nivel, y distinguir *activo* de *alcanzable* para que desactivar un desarrollo arrastre sus descendientes
- [x] 8.2 Contar la dependencia de alcance por rama, no por alcance, para que una intención repetida dentro del mismo desarrollo no dispare desambiguación
- [x] 8.3 Detectar intención sobre todos los alcances alcanzables, para que acotar el menú no vuelva invisible lo definido en un sub-alcance
- [x] 8.4 Reanudar la pregunta retenida solo si el mensaje que estableció el foco no trae intención propia, y caducarla con la ventana del foco
- [x] 8.5 Aportar el contexto de la conversación a la interpolación, y leer `bot_responses.variables`
- [x] 8.6 Dar valor por defecto a los dos mensajes nuevos en `configRepository.get`, como el resto de los mensajes de sistema
- [x] 8.7 Ampliar `test-scope-routing.ts` con los casos que fallaban: árbol de tres niveles, pregunta nueva que desplaza a la retenida, retenida caducada, e interpolación con contexto
