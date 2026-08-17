## 1. Preparación

- [x] 1.1 Leer `openspec/conversacion-objetivo.md` y correr `npx tsx scripts/simulate-fymsa.ts`. Siete de diez turnos pasan hoy **sembrando el contenido a mano**; al terminar deben pasar los mismos con contenido producido por el compilador
- [x] 1.2 Registrar la línea base: qué contesta hoy el bot a cada intención existente, en cada alcance. Es contra lo que se compara para no dejar ninguna pregunta sin respuesta
- [x] 1.3 Leer `generateContent` y `getVisibleIntents`. Los tres defectos están en tres líneas; entender por qué antes de moverlas

## 2. Dónde aterriza cada respuesta

- [x] 2.1 Decidir el alcance destino a partir de los hechos que sostienen la respuesta, no de la forma del árbol
- [x] 2.2 Hechos de varios descendientes a la vez: una sola respuesta en el ancestro común, no una copia por descendiente
- [x] 2.3 Verificar que tres precios atribuidos a tres modelos producen tres respuestas, una en cada modelo
- [x] 2.4 Verificar que una dirección sin sujeto se queda en el desarrollo
- [x] 2.5 Verificar que compilar un segundo desarrollo no toca el contenido del primero

## 3. La intención que falta

- [x] 3.1 Crear la intención en el alcance destino en lugar de descartar la propuesta cuando no existe
- [x] 3.2 Reutilizar el nombre del preset cuando la pregunta corresponde a una conocida; inventar nombre solo cuando el material sustente algo genuinamente nuevo
- [x] 3.3 No duplicar: si el alcance ya hereda esa pregunta de un ancestro y el material da un valor propio, se crea la del alcance y la del ancestro se conserva
- [x] 3.4 Retirar el descarte silencioso: lo que no se pueda colocar aparece como pendiente en la revisión, con el motivo
- [x] 3.5 Verificar que una pregunta sobre amenidades, que hoy no tiene intención, llega a un lead tras aprobarse

## 4. Sustitución

- [x] 4.1 Una sola respuesta activa por (pregunta, alcance)
- [x] 4.2 Aprobar desactiva la anterior con registro de cuál era y cuándo; **nunca borrar**
- [x] 4.3 Rechazar no retira nada
- [x] 4.4 Migración aditiva a partir de la última, con RLS y grants explícitos, que **no desactive nada por sí sola**
- [x] 4.5 Verificar que sustituir en un modelo deja intactas la del desarrollo y las de sus hermanos
- [x] 4.6 Verificar que tras aprobar, un lead recibe **una** respuesta y no dos versiones seguidas

## 5. Las colisiones que ya existen

- [x] 5.1 Detectar los pares (pregunta, alcance) con varias respuestas activas y presentarlos juntos, con una propuesta de cuál conservar
- [x] 5.2 No desactivar ninguna hasta que una persona lo confirme. Mientras no se confirme, el comportamiento es el de hoy
- [x] 5.3 Señalar explícitamente las que fueron editadas a mano: sustituir una de esas exige confirmación aparte
- [x] 5.4 Verificar que ninguna migración modifica el texto de una respuesta existente
- [x] 5.5 Verificar contra la línea base de 1.2 que ninguna intención se queda sin respuesta

## 6. Seguimientos como fragmentos

- [x] 6.1 Convertir las secuencias de varias respuestas para una misma pregunta en una respuesta de varios fragmentos
- [x] 6.2 Conservar el texto literal y el orden. La redacción no se mejora aquí: eso es de la spec de higiene
- [x] 6.3 Verificar que el lead sigue recibiendo los mismos mensajes en el mismo orden

## 7. La caché del árbol

- [x] 7.1 Invalidar por versión y no solo por tiempo: la caché guarda con qué versión se llenó y la comprueba antes de servir
- [x] 7.2 La comprobación tiene que costar menos que releer el árbol; si no, la caché deja de tener sentido
- [x] 7.3 La versión cambia al crear, retirar, renombrar o reactivar un alcance, y al crear una intención de alcance
- [x] 7.4 Verificar con dos procesos: uno crea el alcance, el otro responde a un lead y ya lo ofrece
- [x] 7.5 Verificar el caso inverso, que es el que más duele: desactivar un desarrollo deja de ofrecerlo de inmediato
- [x] 7.6 Verificar que sin cambios no se relee el árbol completo en cada mensaje

## 8. Atomicidad

- [x] 8.1 Lo que se cree en un mismo intento se deshace si el intento falla. Un fallo a media lista no puede dejar intenciones ni respuestas colgando
- [x] 8.2 Verificar reintentando una compilación que falla a la mitad: no quedan restos ni duplicados

## 9. Verificación

- [x] 9.1 Recorrido completo: material de un desarrollo con tres modelos, compilar, aprobar, y preguntar el precio con el foco en cada uno de los tres
- [x] 9.2 Verificar que con el foco en un modelo, la ubicación se hereda del desarrollo
- [ ] 9.3 **Recorrer la conversación objetivo en el simulador**, en el navegador, y anotar turno por turno. Ninguna spec de esta serie se da por terminada leyendo código
- [x] 9.4 Verificar que cada prueba nueva **falla con el código anterior**
- [x] 9.5 Confirmar que ninguna prueba deja datos en la base, y que si los deja, la prueba falla en vez de callarse
- [x] 9.6 Confirmar `tsc --noEmit` limpio y sin emojis, conforme a `AGENTS.md`
- [x] 9.7 Dejar anotado qué debe verificarse en el esquema remoto antes de aplicar en producción, y qué colisiones habrá que resolver a mano en esa base

## 10. Fuera de alcance, anotado

Van en las specs siguientes y **no** se adelantan aquí: la segunda pregunta de desambiguación y las reglas de oferta; la tabla del catálogo y las variables dentro de la prosa; y la limpieza de las plantillas sembradas con marcadores sin llenar.
