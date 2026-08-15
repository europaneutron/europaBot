## 1. Preparación

- [ ] 1.1 Mapear y documentar en `design.md`, **antes de escribir código**, el camino que ya existe para llamar al modelo: cómo `generate-patterns/route.ts` resuelve la llave desde Vault, de dónde sale `ai_model`, y cómo valida al administrador. El compilador reutiliza ese camino; abrir otro duplicaría la gestión del secreto
- [ ] 1.2 Leer las decisiones cerradas en `design.md`. La procedencia llega a documento y página, y el material original se conserva
- [ ] 1.3 Registrar la línea base antes de tocar código: con cero material compilado, el bot responde exactamente lo mismo que hoy. Verificar que la línea base recoge el comportamiento **correcto** y no un defecto existente
- [ ] 1.4 Confirmar contra la API que el proveedor acepta el documento como entrada nativa —no solo texto— y que el modelo elegido lo soporta. De eso depende toda la estrategia de ingesta, así que se comprueba antes de diseñarla
- [ ] 1.5 Decidir y dejar escrito qué modelo lee el documento, y por qué puede diferir del que genera patrones. Configurable por separado

## 2. Esquema

- [ ] 2.1 Migración aditiva a partir de la 033, con RLS y políticas para `service_role` y `authenticated`, y grants explícitos como en la 028
- [ ] 2.2 Material entregado: archivo conservado, texto extraído, alcance al que pertenece, y estado de lectura
- [ ] 2.3 Hechos con su procedencia —documento y página— y el alcance al que se atribuyen
- [ ] 2.4 Dependencia entre una respuesta y los hechos de los que salió, y el origen de la respuesta: propuesta o escrita a mano
- [ ] 2.5 Estado de aprobación de lo propuesto, y huecos de cobertura detectados
- [ ] 2.6 Estado de la compilación por etapas, para poder retomarla sin repetir lo ya hecho
- [ ] 2.7 Marcar como escritas a mano las respuestas que ya existen, para no atribuirlas después al compilador
- [ ] 2.8 Verificar que la secuencia completa de migraciones corre desde cero sin error

## 3. Ingesta

- [ ] 3.1 Aceptar texto, documento y PDF, conservar el archivo y asociarlo a un alcance
- [ ] 3.2 Entregar el PDF al modelo como documento, no como texto aplanado. Es lo que mantiene las tablas enteras, hace legible un precio dentro de una imagen y convierte la página en un dato real en vez de algo a reconstruir
- [ ] 3.3 Usar la extracción de texto solo para los formatos que no admiten entrada nativa, conservando a qué página pertenece cada parte
- [ ] 3.4 Distinguir "no se pudo leer" de "se leyó y no dice nada de eso": son problemas distintos con soluciones distintas y el cliente necesita saber cuál tiene
- [ ] 3.5 Rechazar lo que no se puede procesar, sin dejar una compilación a medias
- [ ] 3.6 Verificar con material representativo: un PDF con tabla de precios, un PDF con precios dentro de una imagen, un documento y un texto plano. El caso de la tabla y el de la imagen son los que justifican la entrada nativa; si fallan, la estrategia no sirve

## 4. Hechos con procedencia

- [ ] 4.1 Extraer hechos atómicos del material completo en una sola pasada, cada uno con documento y página
- [ ] 4.2 Descartar toda afirmación que no pueda atribuirse a una parte del material. Un hecho sin procedencia no se guarda
- [ ] 4.3 Segunda pasada de consolidación: unir duplicados y **reportar contradicciones** en lugar de resolverlas. Dos precios distintos para lo mismo casi siempre significa que uno quedó desactualizado en el documento, y eso lo aclara el cliente, no el modelo
- [ ] 4.4 Dividir solo cuando el material no quepa, y hacerlo por páginas o secciones, nunca por ventanas de tokens. Dejar dicho en el código por qué: un corte por página es explicable y coincide con el nivel de procedencia; un corte a los 4.000 tokens parte una tabla y nadie sabe dónde
- [ ] 4.5 Subir al ancestro los hechos idénticos en todos los hijos, con una regla mecánica y sin intervención del modelo
- [ ] 4.6 Verificar la extracción contra un documento de prueba con hechos conocidos, incluyendo uno que el documento no contiene y que no debe aparecer, y dos que se contradicen y deben reportarse

## 5. Catálogo y cobertura

- [ ] 5.1 Derivar las preguntas candidatas del preset del giro y del propio material
- [ ] 5.2 Marcar como hueco toda pregunta sin hechos que la respalden, y no generar contenido para ella
- [ ] 5.3 Hacer que el material prevalezca sobre el preset cuando difieran
- [ ] 5.4 Verificar los tres casos: pregunta cubierta, pregunta del preset sin respaldo, y hecho del material que el preset no previó

## 6. Contenido propuesto

- [ ] 6.1 Generar patrones de detección y respuestas propuestas por par de alcance e intención
- [ ] 6.2 Registrar de qué hechos depende cada respuesta
- [ ] 6.3 No duplicar en un alcance las intenciones que hereda de su ancestro: se crean respuestas, no intenciones
- [ ] 6.4 No generar invitaciones a agendar dentro del contenido. Un solo componente pide la cita, y es el runtime
- [ ] 6.5 Verificar que lo propuesto no se usa para responder a nadie hasta que se apruebe

## 7. Aprobación y revisión

- [ ] 7.1 Confirmar la forma del árbol **antes** de generar contenido para ella
- [ ] 7.2 Panel de revisión con las respuestas agrupadas, la procedencia visible y los huecos al lado
- [ ] 7.3 Aprobar en bloque, y permitir editar antes de aprobar conservando la dependencia de los hechos
- [ ] 7.4 Rechazar deja el hueco reportado, no lo cierra en silencio
- [ ] 7.5 Verificación **manual en el navegador** del panel completo, antes de pedir revisión. Es la lección de `fragment-editor`: `tsc` y los scripts pasaron en verde con veintitrés hallazgos de interacción abiertos
- [ ] 7.6 Reutilizar los componentes y tokens del stack: shadcn, sin emojis, sin colores fijos que se rompan en modo oscuro

## 8. Recompilación

- [ ] 8.1 Comparar hechos al recibir material nuevo, no textos
- [ ] 8.2 Regenerar solo las respuestas que dependen de un hecho que cambió
- [ ] 8.3 Advertir cuando una respuesta editada a mano dependa de un hecho que cambió, antes de sustituirla
- [ ] 8.4 Señalar como sin respaldo las respuestas cuyo hecho desapareció
- [ ] 8.5 Verificar que una edición a mano sobre un hecho que no cambió sobrevive intacta a una recompilación

## 9. El backlog de contenido

- [ ] 9.1 Agrupar los mensajes que no produjeron respuesta, con cuántas veces ocurrió cada uno
- [ ] 9.2 Relacionar una pregunta recurrente sin respuesta con el hueco que le corresponde
- [ ] 9.3 Retirar del pendiente lo que quede cubierto al aprobar contenido
- [ ] 9.4 Presentar la cobertura como escalamientos evitados, que es la medida que le importa al cliente

## 10. Verificación

- [ ] 10.1 Confirmar que sin material compilado el comportamiento observable del bot es idéntico a la línea base
- [ ] 10.2 Confirmar que responder un mensaje no hace ninguna llamada a un modelo de lenguaje ni toca el material del cliente
- [ ] 10.3 Verificar que el bot sigue respondiendo con contenido aprobado cuando el proveedor externo no está disponible
- [ ] 10.4 Escenario extremo a extremo: subir material, revisar hechos, aprobar estructura, aprobar contenido, y que un lead reciba una respuesta compilada
- [ ] 10.5 Verificar que una compilación interrumpida se retoma sin repetir lo hecho y sin dejar contenido aprobado a medias
- [ ] 10.6 Verificar que cada prueba nueva **falla con el código anterior**, para que no consagre el comportamiento que se está corrigiendo
- [ ] 10.7 Confirmar `tsc --noEmit` limpio y sin emojis nuevos, conforme a `AGENTS.md`
- [ ] 10.8 Dejar anotado en el cambio qué debe verificarse en el esquema remoto antes de aplicar en producción
