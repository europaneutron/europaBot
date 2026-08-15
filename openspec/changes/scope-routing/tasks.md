## 1. Preparación

- [ ] 1.1 Mapear y documentar en `design.md`, antes de escribir código, qué determina hoy el alcance en cada ruta que lo recibe, y qué pasaría a determinarlo. Es el paso que evitó rondas de revisión en el cambio anterior
- [ ] 1.2 Resolver las preguntas abiertas de `design.md`: alias ambiguo, caducidad del foco y anuncio que apunta a un alcance desactivado
- [ ] 1.3 Extender la línea base para que cubra el comportamiento con un solo alcance activo a través de todas las rutas nuevas, y registrarla antes de tocar código

## 2. Esquema

- [ ] 2.1 Migración aditiva con la asociación de anuncios a alcances, con RLS y políticas para `service_role` y `authenticated`
- [ ] 2.2 Alias por alcance, con la restricción que se haya decidido en la tarea 1.2 para el caso ambiguo
- [ ] 2.3 Foco y foco previo en `user_sessions`, y alcance en `conversations`
- [ ] 2.4 Verificar que la secuencia completa de migraciones corre desde cero sin error

## 3. Origen del mensaje

- [ ] 3.1 Extender `extractMessage` para conservar el identificador del anuncio cuando el mensaje se origina en uno, sin alterar el resto del contrato
- [ ] 3.2 Propagar ese origen desde el webhook hasta el procesador de mensajes
- [ ] 3.3 Registrar el anuncio de origen asociado a la conversación, para poder atribuir el lead a la campaña
- [ ] 3.4 Verificar con cargas útiles representativas: mensaje con anuncio conocido, con anuncio no asociado, y sin anuncio

## 4. Foco de la conversación

- [ ] 4.1 Resolver el alcance de cada mensaje según la precedencia definida: anuncio de origen, mención explícita, foco previo, raíz
- [ ] 4.2 Persistir el foco y el foco previo en la sesión
- [ ] 4.3 Partir de ese foco en la detección de intención y en la resolución de contenido, en lugar de asumir la raíz
- [ ] 4.4 Registrar el alcance en cada mensaje de la conversación
- [ ] 4.5 Verificar continuidad del foco entre mensajes y su conservación tras un periodo sin actividad

## 5. Cambio de foco por mención

- [ ] 5.1 Reconocer alias de alcance reutilizando el matcher léxico existente, con tolerancia a errores de escritura
- [ ] 5.2 Cambiar el foco ante una mención explícita, incluso hacia un alcance que no sea hijo inmediato de la raíz
- [ ] 5.3 No cambiar el foco ante el alias de un alcance inactivo
- [ ] 5.4 Verificar que cambiar de foco no altera el estado asociado al alcance anterior

## 6. Saludo compuesto

- [ ] 6.1 Implementar la interpolación de variables en respuestas, hoy pendiente como `TODO` en `conversation.repository.ts`
- [ ] 6.2 Componer el saludo con los alcances activos disponibles
- [ ] 6.3 No plantear elección cuando hay un solo alcance activo o cuando el foco ya está determinado por el anuncio
- [ ] 6.4 Verificar que activar un alcance nuevo lo incorpora al saludo sin editar textos

## 7. Verificación

- [ ] 7.1 Confirmar que con un solo alcance activo la línea base es idéntica, incluyendo saludo, detección, respuestas, recursos y configuración
- [ ] 7.2 Escenario extremo a extremo con dos alcances: lead que llega por anuncio de uno, cambia de foco nombrando el otro, y vuelve al primero
- [ ] 7.3 Verificar mediante `POST /api/test/process-message` la resolución desde cada alcance
- [ ] 7.4 Verificar el comportamiento ante un anuncio sin asociación y ante un alias ambiguo, conforme a lo decidido en la tarea 1.2
- [ ] 7.5 Confirmar `tsc --noEmit` limpio y sin emojis nuevos, conforme a `AGENTS.md`
- [ ] 7.6 Dejar anotado en el cambio qué debe verificarse en el esquema remoto antes de aplicar en producción
