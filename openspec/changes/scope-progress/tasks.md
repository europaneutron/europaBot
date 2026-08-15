## 1. Preparación

- [x] 1.1 Mapear y documentar en `design.md`, **antes de escribir código**, cada lugar que hoy lee o escribe `lead_score`, `lead_status`, `appointment_offered` y los checkpoints, y decir de cada uno si pasa a leer el detalle por alcance o si sigue leyendo la cifra agregada. Son diecisiete archivos; la mayoría no debería cambiar, y eso hay que dejarlo escrito para que nadie los toque de más
- [x] 1.2 Leer las decisiones ya cerradas en `design.md`. No quedan preguntas abiertas que resolver
- [x] 1.3 Registrar la línea base con un solo alcance activo antes de tocar código: checkpoints, cifra y estado del lead, umbral que dispara la oferta, y lo que muestran las vistas del dashboard. Verificar que la línea base recoge el comportamiento **correcto** y no un defecto existente
- [x] 1.4 Confirmar en la base local qué progreso hay registrado hoy, para saber qué tiene que migrar el paso 2.5

## 2. Esquema

- [x] 2.1 Migración aditiva a partir de la 029, con RLS y políticas para `service_role` y `authenticated`, y grants explícitos como en la 028
- [x] 2.2 Alcance en la unicidad de `user_checkpoints`, sin perder las filas existentes
- [x] 2.3 Interés por persona y alcance, con su calificación y estado
- [x] 2.4 Ofrecimiento de cita por alcance, y alcance de origen en `appointments`
- [x] 2.5 Atribuir el progreso existente a la rama que corresponde, dentro de la misma migración. Deduplicar antes de imponer cualquier restricción nueva, como hizo la 025: una base con duplicados es indetectable desde la aplicación y abortaría la migración a medias
- [x] 2.6 Verificar que la secuencia completa de migraciones corre desde cero sin error, y que sobre una copia con datos no pierde ni duplica progreso

## 3. Checkpoints por alcance

- [x] 3.1 Registrar el checkpoint contra el foco resuelto del mensaje
- [x] 3.2 Consultar si un tema está cubierto acotando por alcance
- [x] 3.3 Contar los checkpoints de una rama, incluyendo los de sus descendientes
- [x] 3.4 Verificar el mismo tema cubierto en dos alcances, el mismo tema repetido en uno, y un tema cubierto en un sub-alcance

## 4. Interés y calificación

- [x] 4.1 Calcular y guardar la calificación por persona y alcance
- [x] 4.2 Implementar la agregación hacia la cifra por persona **en un único lugar**, y dejar dicho en el código por qué no puede haber dos
- [x] 4.3 Recalcular la cifra agregada desde todos los caminos que modifican el detalle, sin excepción
- [x] 4.4 Verificar que las vistas del dashboard siguen leyendo lo mismo, sin cambios en su código
- [x] 4.5 Verificar que con un solo alcance la cifra es idéntica a la de la línea base

## 5. Ofrecimiento de cita

- [x] 5.1 Evaluar el umbral sobre la rama del foco
- [x] 5.2 Llevar el ofrecimiento por alcance, de modo que una oferta previa en otro alcance no lo impida
- [x] 5.3 Registrar el alcance de origen al agendar
- [x] 5.4 Verificar la oferta en un segundo desarrollo, la no repetición en el mismo, y el interés repartido que no debe disparar nada

## 6. Frecuencia y señal fuerte

- [x] 6.1 Contar por persona las veces que el bot toma la iniciativa, y el enfriamiento tras un rechazo, aunque el contenido venga de alcances distintos
- [x] 6.2 Permitir marcar una intención como señal fuerte de compra, configurable como el resto de las intenciones
- [x] 6.3 Disparar el ofrecimiento ante una señal fuerte sin esperar al umbral, respetando el enfriamiento
- [x] 6.4 Verificar que un lead interesado en varios alcances no recibe una secuencia de seguimiento por cada uno
- [x] 6.5 Verificar que las respuestas de contenido no invitan a agendar por su cuenta: un solo componente pide la cita

## 7. Verificación

- [x] 7.1 Confirmar que con un solo alcance activo la línea base es idéntica, incluidos checkpoints, cifra, estado, umbral y vistas
- [x] 7.2 Escenario extremo a extremo con dos alcances: lead que profundiza en uno hasta la oferta, cambia de foco, y llega a la oferta del segundo sin que el primero lo bloquee
- [x] 7.3 Escenario de comparación: checkpoints repartidos entre dos ramas que no disparan oferta en ninguna
- [x] 7.4 Verificar el árbol de tres niveles: los checkpoints de un sub-alcance suman a su desarrollo y no a otro
- [x] 7.5 Verificar que la migración de datos existentes no altera la cifra por persona
- [x] 7.6 Verificar que cada prueba nueva **falla con el código anterior**, para que no consagre el comportamiento que se está corrigiendo
- [x] 7.7 Confirmar `tsc --noEmit` limpio y sin emojis nuevos, conforme a `AGENTS.md`
- [x] 7.8 Dejar anotado en el cambio qué debe verificarse en el esquema remoto antes de aplicar en producción

## 8. Correcciones de la revisión

- [x] 8.1 Retirar el filtro por rama y por alcance activo del máximo agregado, para que el alta de un desarrollo nuevo o el agotamiento de uno existente no borren la calificación conseguida
- [x] 8.2 Acotar la puntuación de la raíz a lo atribuido a ella, para que retirar ese filtro no reintroduzca la suma entre ramas
- [x] 8.3 Reparar en la migración a quien ya hubiera quedado por debajo de su detalle, sin rebajar ninguna cifra existente
- [x] 8.4 Recalcular el detalle solo al crearlo y cuando algo cambia, en lugar de en cada mensaje
- [x] 8.5 Sustituir la consulta de progreso por descendiente por una sola consulta
- [x] 8.6 Ampliar `test-scope-progress.ts` con los casos que fallaban: lead histórico ante el alta de un desarrollo, desarrollo desactivado, y la raíz de un lead que compara
