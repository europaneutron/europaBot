## 1. Preparación

- [x] 1.1 Mapear y documentar en `design.md`, **antes de escribir código**, el camino que ya existe para llamar al modelo: cómo `generate-patterns/route.ts` resuelve la llave desde Vault, de dónde sale `ai_model`, y cómo valida al administrador. El compilador reutiliza ese camino; abrir otro duplicaría la gestión del secreto
- [x] 1.2 Leer las decisiones cerradas en `design.md`. La procedencia llega a documento y página, y el material original se conserva
- [x] 1.3 Registrar la línea base antes de tocar código: con cero material compilado, el bot responde exactamente lo mismo que hoy. Verificar que la línea base recoge el comportamiento **correcto** y no un defecto existente
- [x] 1.4 Confirmar contra la API que el proveedor acepta el documento como entrada nativa —no solo texto— y que el modelo elegido lo soporta. De eso depende toda la estrategia de ingesta, así que se comprueba antes de diseñarla
- [ ] 1.5 Medir, no opinar: compilar el mismo brochure real con el modelo económico y con el más capaz disponible, y contrastar ambos contra una lista de hechos hecha a mano. Dejar el resultado escrito en `design.md`. Es un documento y dos ejecuciones, y cierra una discusión que de otro modo no se cierra
- [x] 1.6 Separar los tres papeles de modelo en configuración —extracción, redacción y patrones— en lugar del único `ai_model` actual, conservando el valor de hoy para los patrones

## 2. Esquema

- [x] 2.1 Migración aditiva a partir de la 033, con RLS y políticas para `service_role` y `authenticated`, y grants explícitos como en la 028
- [x] 2.2 Material entregado: archivo conservado, texto extraído, alcance al que pertenece, y estado de lectura
- [x] 2.3 Hechos con su procedencia —documento y página— y el alcance al que se atribuyen
- [x] 2.4 Dependencia entre una respuesta y los hechos de los que salió, y el origen de la respuesta: propuesta o escrita a mano
- [x] 2.5 Estado de aprobación de lo propuesto, y huecos de cobertura detectados
- [x] 2.5b Señales de revisión de cada propuesta, y registro de con qué señales se aprobó
- [x] 2.6 Estado de la compilación por etapas, para poder retomarla sin repetir lo ya hecho
- [x] 2.7 Marcar como escritas a mano las respuestas que ya existen, para no atribuirlas después al compilador
- [x] 2.8 Verificar que la secuencia completa de migraciones corre desde cero sin error

## 3. Ingesta

- [x] 3.1 Aceptar texto, documento y PDF, conservar el archivo y asociarlo a un alcance
- [x] 3.2 Entregar el PDF al modelo como documento, no como texto aplanado. Es lo que mantiene las tablas enteras, hace legible un precio dentro de una imagen y convierte la página en un dato real en vez de algo a reconstruir
- [ ] 3.3 Usar la extracción de texto solo para los formatos que no admiten entrada nativa, conservando a qué página pertenece cada parte
- [x] 3.4 Distinguir "no se pudo leer" de "se leyó y no dice nada de eso": son problemas distintos con soluciones distintas y el cliente necesita saber cuál tiene
- [x] 3.5 Rechazar lo que no se puede procesar, sin dejar una compilación a medias
- [ ] 3.6 Verificar con material representativo: un PDF con tabla de precios, un PDF con precios dentro de una imagen, un documento y un texto plano. El caso de la tabla y el de la imagen son los que justifican la entrada nativa; si fallan, la estrategia no sirve

## 4. Hechos con procedencia

- [x] 4.1 Extraer hechos atómicos del material completo en una sola pasada, cada uno con documento y página
- [x] 4.2 Descartar toda afirmación que no pueda atribuirse a una parte del material. Un hecho sin procedencia no se guarda
- [x] 4.3 Segunda pasada de consolidación: unir duplicados y **reportar contradicciones** en lugar de resolverlas. Dos precios distintos para lo mismo casi siempre significa que uno quedó desactualizado en el documento, y eso lo aclara el cliente, no el modelo
- [ ] 4.4 Dividir solo cuando el material no quepa, y hacerlo por páginas o secciones, nunca por ventanas de tokens. Dejar dicho en el código por qué: un corte por página es explicable y coincide con el nivel de procedencia; un corte a los 4.000 tokens parte una tabla y nadie sabe dónde
- [x] 4.5 Subir al ancestro los hechos idénticos en todos los hijos, con una regla mecánica y sin intervención del modelo
- [x] 4.6 Verificar la extracción contra un documento de prueba con hechos conocidos, incluyendo uno que el documento no contiene y que no debe aparecer, y dos que se contradicen y deben reportarse

## 5. Catálogo y cobertura

- [x] 5.1 Derivar las preguntas candidatas del preset del giro y del propio material
- [x] 5.2 Marcar como hueco toda pregunta sin hechos que la respalden, y no generar contenido para ella
- [x] 5.3 Hacer que el material prevalezca sobre el preset cuando difieran
- [x] 5.4 Verificar los tres casos: pregunta cubierta, pregunta del preset sin respaldo, y hecho del material que el preset no previó

## 6. Contenido propuesto

- [x] 6.1 Generar patrones de detección y respuestas propuestas por par de alcance e intención
- [x] 6.2 Registrar de qué hechos depende cada respuesta
- [x] 6.3 No duplicar en un alcance las intenciones que hereda de su ancestro: se crean respuestas, no intenciones
- [x] 6.4 No generar invitaciones a agendar dentro del contenido. Un solo componente pide la cita, y es el runtime
- [x] 6.5 Verificar que lo propuesto no se usa para responder a nadie hasta que se apruebe

## 7. Aprobación y revisión

- [x] 7.1 Confirmar la forma del árbol **antes** de generar contenido para ella
- [x] 7.2 Panel de revisión con las respuestas agrupadas, la procedencia visible y los huecos al lado
- [x] 7.2b Señalar cada propuesta con lo que merece atención: sin respaldo, contradicción, procedencia dudosa, dato sensible, cambió desde la última compilación, editada a mano
- [x] 7.2c Marcar el dato sensible con una **regla determinista** sobre el tipo del hecho —dinero, fecha, condición contractual—, no con el criterio del modelo. Es la señal más barata y la que cubre el riesgo real
- [x] 7.2d Ordenar el panel por señal y no por intención, de modo que lo que necesita ojos aparezca primero y lo limpio se pueda aprobar en bloque
- [x] 7.3 Aprobar en bloque, y permitir editar antes de aprobar conservando la dependencia de los hechos
- [x] 7.4 Rechazar deja el hueco reportado, no lo cierra en silencio
- [ ] 7.5 Verificación **manual en el navegador** del panel completo, antes de pedir revisión. Es la lección de `fragment-editor`: `tsc` y los scripts pasaron en verde con veintitrés hallazgos de interacción abiertos
- [x] 7.6 Reutilizar los componentes y tokens del stack: shadcn, sin emojis, sin colores fijos que se rompan en modo oscuro

## 8. Recompilación

- [x] 8.1 Comparar hechos al recibir material nuevo, no textos
- [x] 8.2 Regenerar solo las respuestas que dependen de un hecho que cambió
- [x] 8.3 Advertir cuando una respuesta editada a mano dependa de un hecho que cambió, antes de sustituirla
- [x] 8.4 Señalar como sin respaldo las respuestas cuyo hecho desapareció
- [x] 8.5 Verificar que una edición a mano sobre un hecho que no cambió sobrevive intacta a una recompilación

## 9. El backlog de contenido

- [x] 9.1 Agrupar los mensajes que no produjeron respuesta, con cuántas veces ocurrió cada uno
- [x] 9.2 Relacionar una pregunta recurrente sin respuesta con el hueco que le corresponde
- [x] 9.3 Retirar del pendiente lo que quede cubierto al aprobar contenido
- [x] 9.4 Presentar la cobertura como escalamientos evitados, que es la medida que le importa al cliente

## 10. Verificación

- [x] 10.1 Confirmar que sin material compilado el comportamiento observable del bot es idéntico a la línea base
- [x] 10.2 Confirmar que responder un mensaje no hace ninguna llamada a un modelo de lenguaje ni toca el material del cliente
- [x] 10.3 Verificar que el bot sigue respondiendo con contenido aprobado cuando el proveedor externo no está disponible
- [ ] 10.4 Escenario extremo a extremo: subir material, revisar hechos, aprobar estructura, aprobar contenido, y que un lead reciba una respuesta compilada
- [x] 10.5 Verificar que una compilación interrumpida se retoma sin repetir lo hecho y sin dejar contenido aprobado a medias
- [x] 10.6 Verificar que cada prueba nueva **falla con el código anterior**, para que no consagre el comportamiento que se está corrigiendo
- [x] 10.7 Confirmar `tsc --noEmit` limpio y sin emojis nuevos, conforme a `AGENTS.md`
- [x] 10.8 Dejar anotado en el cambio qué debe verificarse en el esquema remoto antes de aplicar en producción

## 11. Correcciones de la revisión

- [x] 11.1 Fusionar los candidatos del preset y del material por intención, uniendo sus claves: el preset aporta el enunciado y el material aporta las claves con las que el modelo nombró sus propios hechos. Antes producían dos filas para la misma intención, una cubierta y otra como hueco
- [x] 11.2 Emparejar la cobertura por clave normalizada y con alias en los dos idiomas. El material y el prompt están en español, y esperar solo claves en inglés convertía en hueco todo lo que el documento sí responde, con la consecuencia encadenada de no generar contenido
- [x] 11.3 Dar sujeto a los hechos, para que la contradicción sea el mismo dato sobre el mismo sujeto. Sin él, un catálogo de tres modelos con tres precios se marcaba como contradictorio, y una señal siempre encendida anula el triaje que la justifica
- [x] 11.4 Señalar el dato sensible por la forma del valor y no por el tipo que declaró el modelo, como exige el requisito. El tipo declarado se acepta como señal adicional, nunca como la única
- [x] 11.5 Dejar los tres papeles de modelo en el único identificador verificado del proyecto. Los sembrados por la 033 no existen en la API, y un nombre inventado no falla al guardarse: falla al compilar, con un 404 enterrado en `last_error`
- [x] 11.6 Agregar `scripts/list-ai-models.ts` para elegir el modelo comprobando el catálogo real de la llave, en vez de escribirlo de memoria
- [x] 11.7 Retirar de `authenticated` la escritura sobre `compiler_proposals`. Solo `approve_compiler_proposal` mueve el estado, para que no exista una propuesta aprobada sin respuesta que la sirva
- [x] 11.8 Ampliar `scripts/test-document-compiler.ts` con los casos que fallaban: catálogo frente a contradicción, claves en español, fusión de candidatos y dato sensible mal tipificado
