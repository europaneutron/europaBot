## 1. La lista de preguntas

- [x] 1.1 Agrupar por `intent_name` en vez de por registro
- [x] 1.2 Cada fila dice en cuantos alcances hay respuesta
- [x] 1.3 La busqueda encuentra la pregunta una vez, no una por alcance
- [x] 1.4 Archivadas sigue funcionando igual, agrupado tambien
- [ ] 1.5 Verificacion manual en el navegador

## 2. El arbol dentro de la pregunta

- [x] 2.1 La pagina se identifica por la pregunta, no por un registro
- [x] 2.2 Arbol de alcances alcanzables con la respuesta de cada uno
- [x] 2.3 Propia y heredada se distinguen a simple vista
- [x] 2.4 Cada respuesta compilada enseña su documento y su pagina
- [x] 2.5 Un alcance retirado no aparece
- [ ] 2.6 Verificacion manual en el navegador
- [x] 2.7 Una respuesta archivada se ve y se puede restaurar desde el arbol
- [x] 2.8 El arbol enlaza al editor de vocabulario y prioridad de cada fila propia

## 3. Escribir y borrar una respuesta propia

- [x] 3.1 Escribir una propia desde un alcance que hereda
- [x] 3.2 Borrar una propia devuelve a heredar
- [x] 3.3 Borrar la respuesta de la que otros heredan avisa a cuantos deja sin respuesta
- [x] 3.4 Prueba: crear y borrar una propia no toca a los hermanos
- [x] 3.5 Prueba: el aviso cuenta los mismos alcances que resolveria el runtime

## 4. El rotulo cabe

- [x] 4.1 Comprobar el rotulo corto antes de publicar: largo maximo y que no sea la pregunta
- [x] 4.2 Un rotulo que no pasa se pide de nuevo, solo ese
- [x] 4.3 El segundo intento fallido cae a un rotulo derivado de la clave
- [x] 4.4 Prueba con el modelo doblado: rotulo largo, rotulo que es la pregunta, rotulo correcto
- [x] 4.5 Prueba: corregir el rotulo no toca vocabulario ni respuestas

## 5. La unidad no se repite

- [x] 5.1 Colapso de unidad de varias palabras alrededor de un valor sustituido
- [x] 5.2 Una repeticion escrita en la plantilla se respeta
- [x] 5.3 Prueba: "1 medio bano medio bano", "96 casas casas", "Ya ya veremos", "250 m2"

## 6. Una sola fuente para el asesor

- [x] 6.1 Migracion aditiva: `bot_config` gana `scope_id`, lo existente queda como global
- [x] 6.2 Lectura por alcance con la herencia del resto del contenido
- [x] 6.3 Mapear todas las lecturas de `advisor_phone`, `business_hours` y `advisor_email`
- [x] 6.4 Migracion posterior: retirar esas tres columnas de `agent_config`
- [x] 6.8 La retirada arrastra a `bot_config` los valores por alcance antes de soltar las columnas
- [x] 6.5 Sin telefono en el alcance ni en sus ancestros, la derivacion falla de forma visible
- [x] 6.6 Prueba: un desarrollo con asesor propio y otro que hereda
- [x] 6.7 `AGENTS.md` seccion 6 deja de describir la trampa

## 7. Recorrido de aceptacion

- [ ] 7.1 Corrida real del compilador: ningun rotulo publicado pasa de veinte caracteres ni es una pregunta
- [ ] 7.2 La lista enseña una fila por pregunta con el material de FYMSA publicado
- [ ] 7.3 El arbol de `precio` enseña sus seis alcances y cual hereda
- [x] 7.4 Ninguna respuesta repite una unidad
- [x] 7.5 El runtime sigue sin llamar al modelo durante un mensaje
- [x] 7.6 Ninguna prueba deja datos temporales
