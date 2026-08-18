## 1. La comprobacion

- [x] 1.1 `vocabularyReachesQuestion(patterns, question, paraphrases)` en `compiler-rules.ts`, construyendo un `FuzzyMatcher` con los patrones propuestos
- [x] 1.2 Devuelve que frases enganchan y cuales no, para poder explicarlo en el panel
- [x] 1.3 Prueba unitaria: un vocabulario con las listas vacias no alcanza su pregunta; uno con sinonimos del material si
- [x] 1.4 Prueba unitaria: la comprobacion usa el mismo matcher del runtime y no una comparacion de cadenas

## 2. Generar el vocabulario

- [x] 2.1 La etapa de redaccion pide al modelo, por propuesta, como preguntaria esto un lead por WhatsApp
- [x] 2.2 Minimos por lista en el esquema JSON como primera barrera
- [x] 2.3 El prompt exige que las palabras salgan del material y no de un vocabulario del sector
- [x] 2.4 Las palabras del nombre de la intencion dejan de ser la fuente del vocabulario

## 3. Catalogo estable de preguntas

- [x] 3.1 Las preguntas descubiertas se mapean contra `REAL_ESTATE_PRESET` antes de proponerse
- [x] 3.2 Una pregunta que no encaja se admite con nombre en lengua de lead
- [x] 3.3 Compilar dos veces el mismo material produce los mismos nombres
- [x] 3.4 Verificar con FYMSA que no aparecen `precio_modelos`, `fichas_modelos` ni `condiciones_comerciales`

## 4. Bloquear lo que no alcanza

- [x] 4.1 Una propuesta que no pasa la comprobacion se marca con la senal nueva y no entra en la publicacion
- [x] 4.2 Migracion aditiva con la senal de revision
- [x] 4.3 Las demas propuestas de la corrida se publican igual
- [x] 4.4 La pregunta bloqueada conserva lo que hubiera antes
- [x] 4.5 Recompilar puede desbloquearla sin intervencion aparte

## 5. No empobrecer

- [x] 5.1 Comparar el alcance del vocabulario nuevo con el de la pregunta que sustituye
- [x] 5.2 Marcar antes de publicar cuando el nuevo reconoce menos, indicando que formas se pierden
- [x] 5.3 No marcar cuando reconoce todo lo anterior y algo mas

## 6. El panel

- [x] 6.1 Una propuesta bloqueada se ve con el motivo: que pregunta dice cubrir y que frases no engancha
- [x] 6.2 La marca de empobrecimiento se ve antes de publicar
- [x] 6.3 El resumen de publicacion distingue publicadas de bloqueadas

## 7. Pruebas

- [x] 7.1 Un lead escribe "que casas manejan" sobre material que dice casas y recibe respuesta, no fallback
- [x] 7.2 Un lead escribe "cuanto cuesta" y recibe el precio
- [x] 7.3 Un lead escribe "precio de Solara" con el foco suelto y recibe el precio de ese modelo
- [x] 7.4 Material de otro sector: el vocabulario publicado usa sus palabras y no las de vivienda
- [x] 7.5 Ninguna respuesta publicada tiene un vocabulario reducido a las palabras de su nombre
- [x] 7.6 El runtime sigue sin llamar al modelo durante un mensaje
- [x] 7.7 Ninguna prueba deja datos temporales

## 8. Recorrido de aceptacion

- [x] 8.1 `scripts/walkthrough-fymsa.ts` con la base sembrada: compilar, publicar y conversar
- [x] 8.2 Los turnos que hoy caen al fallback reciben respuesta del material
- [ ] 8.3 Recorrer los turnos de `openspec/conversacion-objetivo.md` sobre el contenido publicado
- [ ] 8.4 Desmarcar como bloqueadas las tareas 9.1-9.4 de `material-sustituye` y cerrarlas

> Verificado el 18 de agosto de 2026: 8.1-8.2 y los casos 7.1-7.7 pasan. El
> recorrido completo sigue pendiente porque "me interesa Europa" no fija foco
> por si solo y una secuencia sin foco puede elegir entre vocabularios
> solapados. Son reglas de continuidad y desambiguacion fuera del alcance de
> este cambio; por eso 8.3-8.4 y 9.3-9.4 de `material-sustituye` quedan abiertos.
