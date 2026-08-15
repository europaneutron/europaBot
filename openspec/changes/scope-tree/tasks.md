## 1. Línea base

- [x] 1.1 Ampliar o crear un script `tsx` que capture el comportamiento actual del bot extremo a extremo: detección de intención y respuesta resuelta para un conjunto representativo de mensajes, con contenido sembrado en los tres formatos de respuesta
- [x] 1.2 Registrar esa salida como línea base para comparar después de cada paso; ninguna tarea posterior debe alterarla mientras exista un solo alcance
- [x] 1.3 Resolver las preguntas abiertas de `design.md`: dónde vive la resolución ascendente y qué configuración se acota en esta entrega

## 2. Árbol de alcances

- [x] 2.1 Migración aditiva que crea la tabla de alcances con referencia a sí misma, estado de actividad y la etiqueta informativa de tipo, con RLS y políticas para `service_role` y `authenticated`
- [x] 2.2 Garantizar la integridad del árbol: un alcance no puede ser su propio ancestro
- [x] 2.3 Sembrar en la misma migración el alcance raíz que adopta el contenido existente
- [x] 2.4 Verificar que la secuencia completa de migraciones corre desde cero sin error

## 3. Resolución por herencia

- [x] 3.1 Implementar el recorrido ascendente en un único lugar, reutilizable para contenido, recursos y configuración
- [x] 3.2 Cachear el árbol en memoria con expiración, siguiendo el patrón ya usado para la carga de intenciones, sin agregar consultas por mensaje
- [x] 3.3 Escribir un script `tsx` que verifique la resolución: contenido propio, heredado de un ancestro, sustitución del padre por el hijo, ausencia en toda la cadena y continuidad a través de un nodo inactivo

## 4. Intenciones acotadas

- [x] 4.1 Migración aditiva que agrega el alcance a las intenciones, con alcance nulo para las globales
- [x] 4.2 Sustituir la unicidad global del nombre de intención por unicidad dentro del alcance
- [x] 4.3 Ajustar la carga de intenciones para que el conjunto de candidatos sean las visibles desde el alcance activo: propias, de ancestros y globales
- [x] 4.4 Verificar con la línea base que con un solo alcance la detección devuelve exactamente lo mismo que antes

## 5. Referencia de respuestas, primera etapa

- [x] 5.1 Migración aditiva que agrega el identificador de intención a `bot_responses` y lo rellena desde el nombre, dejando conviviendo ambas columnas
- [x] 5.2 Actualizar los seis puntos de los repositorios que consultan por nombre de intención para usar el identificador
- [x] 5.3 Recablear las cuatro pantallas que consultan intenciones por nombre, sin modificar su diseño ni su comportamiento
- [x] 5.4 Verificar que las respuestas existentes en los tres formatos se siguen resolviendo igual que en la línea base

## 6. Recursos y configuración

- [x] 6.1 Migración aditiva que acota los recursos por alcance, asociando los existentes a la raíz
- [x] 6.2 Acotar por alcance únicamente los valores de configuración decididos en la tarea 1.3, resolviéndolos con el mismo recorrido ascendente
- [x] 6.3 Verificar la herencia de recursos como conjuntos completos y la herencia de configuración con un script `tsx`

## 7. Verificación con dos alcances

- [x] 7.1 Sembrar por SQL un segundo alcance con su propio contenido, incluyendo una intención con el mismo nombre que otra existente y contenido distinto
- [x] 7.2 Verificar que cada alcance resuelve su propio contenido y que lo definido en la raíz lo heredan ambos
- [x] 7.3 Verificar mediante `POST /api/test/process-message` que el bot responde correctamente resolviendo desde cada alcance
- [x] 7.4 Confirmar que con el alcance raíz como único activo el bot se comporta exactamente igual que en la línea base

## 8. Cierre

- [x] 8.1 Confirmar `tsc --noEmit` limpio y sin emojis nuevos, conforme a `AGENTS.md`
- [x] 8.2 Documentar en el propio cambio qué migración posterior debe retirar la columna de nombre en `bot_responses`, y qué hay que verificar antes de ejecutarla
- [x] 8.3 Dejar anotado el procedimiento de comparación del esquema remoto en modo lectura, previo a aplicar en producción
- [x] 8.4 Verificar que el refresco explícito invalida el árbol, que el caché por alcance está acotado y que el endpoint de prueba rechaza alcances inexistentes o inactivos
- [x] 8.5 Verificar la cadena `agent_config` por alcance → `bot_config` global, incluyendo edición inmediata desde Ajustes, ausencia total de teléfono y degradación ante fallo del árbol
- [x] 8.6 Ejecutar dos veces el seed de formatos y comprobar que conserva un solo intent y una sola respuesta por fixture
- [x] 8.7 Verificar que una escritura legacy ambigua y un cambio de `intent_name` sobre una respuesta con `intent_id` fallan explícitamente
