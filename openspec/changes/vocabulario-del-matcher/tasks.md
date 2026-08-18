## 1. La comprobacion

- [ ] 1.1 `vocabularyReachesQuestion(patterns, question, paraphrases)` en `compiler-rules.ts`, construyendo un `FuzzyMatcher` con los patrones propuestos
- [ ] 1.2 Devuelve que frases enganchan y cuales no, para poder explicarlo en el panel
- [ ] 1.3 Prueba unitaria: un vocabulario con las listas vacias no alcanza su pregunta; uno con sinonimos del material si
- [ ] 1.4 Prueba unitaria: la comprobacion usa el mismo matcher del runtime y no una comparacion de cadenas

## 2. Generar el vocabulario

- [ ] 2.1 La etapa de redaccion pide al modelo, por propuesta, como preguntaria esto un lead por WhatsApp
- [ ] 2.2 Minimos por lista en el esquema JSON como primera barrera
- [ ] 2.3 El prompt exige que las palabras salgan del material y no de un vocabulario del sector
- [ ] 2.4 Las palabras del nombre de la intencion dejan de ser la fuente del vocabulario

## 3. Catalogo estable de preguntas

- [ ] 3.1 Las preguntas descubiertas se mapean contra `REAL_ESTATE_PRESET` antes de proponerse
- [ ] 3.2 Una pregunta que no encaja se admite con nombre en lengua de lead
- [ ] 3.3 Compilar dos veces el mismo material produce los mismos nombres
- [ ] 3.4 Verificar con FYMSA que no aparecen `precio_modelos`, `fichas_modelos` ni `condiciones_comerciales`

## 4. Bloquear lo que no alcanza

- [ ] 4.1 Una propuesta que no pasa la comprobacion se marca con la senal nueva y no entra en la publicacion
- [ ] 4.2 Migracion aditiva con la senal de revision
- [ ] 4.3 Las demas propuestas de la corrida se publican igual
- [ ] 4.4 La pregunta bloqueada conserva lo que hubiera antes
- [ ] 4.5 Recompilar puede desbloquearla sin intervencion aparte

## 5. No empobrecer

- [ ] 5.1 Comparar el alcance del vocabulario nuevo con el de la pregunta que sustituye
- [ ] 5.2 Marcar antes de publicar cuando el nuevo reconoce menos, indicando que formas se pierden
- [ ] 5.3 No marcar cuando reconoce todo lo anterior y algo mas

## 6. El panel

- [ ] 6.1 Una propuesta bloqueada se ve con el motivo: que pregunta dice cubrir y que frases no engancha
- [ ] 6.2 La marca de empobrecimiento se ve antes de publicar
- [ ] 6.3 El resumen de publicacion distingue publicadas de bloqueadas

## 7. Pruebas

- [ ] 7.1 Un lead escribe "que casas manejan" sobre material que dice casas y recibe respuesta, no fallback
- [ ] 7.2 Un lead escribe "cuanto cuesta" y recibe el precio
- [ ] 7.3 Un lead escribe "precio de Solara" con el foco suelto y recibe el precio de ese modelo
- [ ] 7.4 Material de otro sector: el vocabulario publicado usa sus palabras y no las de vivienda
- [ ] 7.5 Ninguna respuesta publicada tiene un vocabulario reducido a las palabras de su nombre
- [ ] 7.6 El runtime sigue sin llamar al modelo durante un mensaje
- [ ] 7.7 Ninguna prueba deja datos temporales

## 8. Recorrido de aceptacion

- [ ] 8.1 `scripts/walkthrough-fymsa.ts` con la base sembrada: compilar, publicar y conversar
- [ ] 8.2 Los turnos que hoy caen al fallback reciben respuesta del material
- [ ] 8.3 Recorrer los turnos de `openspec/conversacion-objetivo.md` sobre el contenido publicado
- [ ] 8.4 Desmarcar como bloqueadas las tareas 9.1-9.4 de `material-sustituye` y cerrarlas
