## 1. La lista de preguntas

- [ ] 1.1 Agrupar por `intent_name` en vez de por registro
- [ ] 1.2 Cada fila dice en cuantos alcances hay respuesta
- [ ] 1.3 La busqueda encuentra la pregunta una vez, no una por alcance
- [ ] 1.4 Archivadas sigue funcionando igual, agrupado tambien
- [ ] 1.5 Verificacion manual en el navegador

## 2. El arbol dentro de la pregunta

- [ ] 2.1 La pagina se identifica por la pregunta, no por un registro
- [ ] 2.2 Arbol de alcances alcanzables con la respuesta de cada uno
- [ ] 2.3 Propia y heredada se distinguen a simple vista
- [ ] 2.4 Cada respuesta compilada enseña su documento y su pagina
- [ ] 2.5 Un alcance retirado no aparece
- [ ] 2.6 Verificacion manual en el navegador

## 3. Escribir y borrar una respuesta propia

- [ ] 3.1 Escribir una propia desde un alcance que hereda
- [ ] 3.2 Borrar una propia devuelve a heredar
- [ ] 3.3 Borrar la respuesta de la que otros heredan avisa a cuantos deja sin respuesta
- [ ] 3.4 Prueba: crear y borrar una propia no toca a los hermanos
- [ ] 3.5 Prueba: el aviso cuenta los mismos alcances que resolveria el runtime

## 4. El rotulo cabe

- [ ] 4.1 Comprobar el rotulo corto antes de publicar: largo maximo y que no sea la pregunta
- [ ] 4.2 Un rotulo que no pasa se pide de nuevo, solo ese
- [ ] 4.3 El segundo intento fallido cae a un rotulo derivado de la clave
- [ ] 4.4 Prueba con el modelo doblado: rotulo largo, rotulo que es la pregunta, rotulo correcto
- [ ] 4.5 Prueba: corregir el rotulo no toca vocabulario ni respuestas

## 5. La unidad no se repite

- [ ] 5.1 Colapso de unidad de varias palabras alrededor de un valor sustituido
- [ ] 5.2 Una repeticion escrita en la plantilla se respeta
- [ ] 5.3 Prueba: "1 medio bano medio bano", "96 casas casas", "Ya ya veremos", "250 m2"

## 6. Una sola fuente para el asesor

- [ ] 6.1 Migracion aditiva: `bot_config` gana `scope_id`, lo existente queda como global
- [ ] 6.2 Lectura por alcance con la herencia del resto del contenido
- [ ] 6.3 Mapear todas las lecturas de `advisor_phone`, `business_hours` y `advisor_email`
- [ ] 6.4 Migracion posterior: retirar esas tres columnas de `agent_config`
- [ ] 6.5 Sin telefono en el alcance ni en sus ancestros, la derivacion falla de forma visible
- [ ] 6.6 Prueba: un desarrollo con asesor propio y otro que hereda
- [ ] 6.7 `AGENTS.md` seccion 6 deja de describir la trampa

## 7. Recorrido de aceptacion

- [ ] 7.1 Corrida real del compilador: ningun rotulo publicado pasa de veinte caracteres ni es una pregunta
- [ ] 7.2 La lista enseña una fila por pregunta con el material de FYMSA publicado
- [ ] 7.3 El arbol de `precio` enseña sus seis alcances y cual hereda
- [ ] 7.4 Ninguna respuesta repite una unidad
- [ ] 7.5 El runtime sigue sin llamar al modelo durante un mensaje
- [ ] 7.6 Ninguna prueba deja datos temporales
