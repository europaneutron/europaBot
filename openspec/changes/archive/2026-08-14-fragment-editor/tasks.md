## 1. Base conservada

La capa de datos de la primera implementación quedó verificada y se conserva. No rehacerla.

- [x] `src/lib/utils/response-blocks.ts` — conversión entre los tres formatos y `normalizeResponseWrite` compartida por ambos repositorios
- [x] `src/lib/constants/response-composer.ts` — pausas, máximo de bloques, umbral de advertencia
- [x] `src/services/storage/media-upload.ts` — subida múltiple con rechazo por tipo
- [x] `scripts/test-response-formats.ts`, `scripts/test-fragment-conversion.ts`, `scripts/test-editor-*.ts`, `scripts/seed-response-formats.ts`
- [x] 1.1 Proteger el decodificado de `media_url` en `response-blocks.ts` para que una URL malformada no propague el error a la pantalla

## 2. Biblioteca de medios

- [x] 2.1 Resolver el filtrado por tipo y por carpeta como un solo criterio coherente, de modo que solicitar un tipo nunca produzca un resultado vacío por contradicción entre filtros
- [x] 2.2 Derivar la lista visible con `useMemo` desde una única fuente de verdad, sin lista filtrada en paralelo
- [x] 2.3 Declarar tipo explícito en todos los botones del componente, para que ninguno tenga envío implícito
- [x] 2.4 No dejar seleccionado un archivo recién subido que el filtro activo oculta
- [x] 2.5 Verificar que los consumidores existentes de `MediaLibrary` siguen funcionando sin cambios

## 3. Compositor de bloques

- [x] 3.1 Construir la pantalla de respuestas sin `<form>`: acciones con manejadores explícitos y ningún control con envío implícito
- [x] 3.2 Renderizar el modal de biblioteca en un portal, fuera del árbol del compositor
- [x] 3.3 Implementar el bloque individual: edición según tipo, selector de pausa restringido a los valores predefinidos que además muestra valores heredados fuera del conjunto, y acciones de eliminar y mover
- [x] 3.4 Implementar el reordenamiento con arrastre y con controles de mover arriba y abajo accesibles por teclado, cuidando que un arrastre cancelado no deje estado residual
- [x] 3.5 Implementar el contenedor de la secuencia con una única fuente de verdad para los bloques, sin referencias paralelas al estado
- [x] 3.6 Integrar la subida y la selección múltiple, derivando el tipo de bloque del archivo y no del control que abrió la biblioteca, preservando el nombre original del archivo
- [x] 3.7 Reportar cuántos archivos se omitieron y por qué al alcanzar el máximo de bloques, agregando los que caben
- [x] 3.8 Implementar la validación por bloque y la validación global antes de guardar
- [x] 3.9 Implementar el indicador de tiempo estimado de envío con su advertencia y el bloqueo al alcanzar el máximo

## 4. Vista previa

- [x] 4.1 Renderizar cada bloque como una burbuja independiente en el orden de envío, con imágenes renderizadas y documentos identificados por nombre
- [x] 4.2 Derivarla del estado del compositor para que refleje ediciones, altas, bajas y reordenamientos

## 5. Persistencia

- [x] 5.1 Cargar respuestas en los tres formatos de origen y guardarlas siempre como `fragmented`, aplicando `normalizeResponseWrite` en ambos repositorios
- [x] 5.2 Verificar que el guardado cumple el constraint `message_text_or_media_required`
- [x] 5.3 Verificar que ninguna acción distinta de guardar persiste la respuesta

## 6. Verificación automatizada

- [x] 6.1 Ejecutar los scripts conservados y confirmar que `getBotResponses` devuelve lo mismo que la línea base
- [x] 6.2 Verificar mediante `POST /api/test/process-message` que el bot resuelve una respuesta creada con el compositor
- [x] 6.3 Confirmar `tsc --noEmit` limpio y sin emojis nuevos, conforme a `AGENTS.md`

## 7. Verificación manual en el navegador

Obligatoria antes de dar por terminado. La revisión automatizada no detecta defectos de
interacción: las tres rondas previas pasaron `tsc` y los scripts en verde con 23 hallazgos
abiertos.

- [x] 7.1 Con el editor abierto, usar los controles de filtrado, subida y cierre de la biblioteca: la respuesta no se guarda ni el editor se cierra
- [x] 7.2 Escribir en un bloque de texto mientras se suben archivos: el texto sobrevive
- [x] 7.3 Seleccionar archivos, cambiar de ubicación o filtro, seleccionar más: llegan todos
- [x] 7.4 Subir un archivo desde dentro de la biblioteca con un filtro activo que lo oculta: no queda seleccionado
- [x] 7.5 Solicitar cada tipo de archivo desde el compositor: la biblioteca muestra resultados coherentes en todos
- [x] 7.6 Iniciar un arrastre de bloque, cancelarlo, y luego soltar un archivo: no reordena ni descarta el archivo
- [x] 7.7 Abrir una respuesta con una pausa fuera del conjunto ofrecido: el control muestra el valor
- [x] 7.8 Agregar un documento cuyo nombre empiece con dígitos: el nombre llega íntegro
