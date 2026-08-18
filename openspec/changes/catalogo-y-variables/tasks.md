## 1. Donde viven los valores

- [ ] 1.1 Migracion aditiva: tabla de valores acotada por alcance, con clave, valor, tipo, unidad y procedencia
- [ ] 1.2 Marca de edicion humana con quien y cuando, sin perder de que documento y pagina venia
- [ ] 1.3 Repositorio con lectura por alcance y escritura por valor
- [ ] 1.4 Prueba: dos modelos con precio propio no se pisan

## 2. Publicar escribe el catalogo

- [ ] 2.1 Aprobar una corrida escribe sus hechos como valores del alcance que les corresponde
- [ ] 2.2 El valor conserva documento y pagina
- [ ] 2.3 En modo sustituir el material gana; en modo anadir no toca lo existente
- [ ] 2.4 Prueba: un valor sigue disponible cuando su corrida ya no es la ultima

## 3. Resolver un hueco

- [ ] 3.1 Resolucion por alcance con `resolveRows`: lo propio primero, lo heredado despues
- [ ] 3.2 `interpolateMessage` distingue "no habia variable" de "faltaba el valor"
- [ ] 3.3 Una respuesta con un hueco sin valor no se envia
- [ ] 3.4 Prueba: la misma frase desde dos modelos da dos precios
- [ ] 3.5 Prueba: un valor solo del desarrollo se hereda al modelo
- [ ] 3.6 Prueba: nunca sale una frase con el hueco vacio ni con el token crudo

## 4. Redactar con huecos

- [ ] 4.1 La etapa de redaccion pide prosa con huecos y no con cifras
- [ ] 4.2 La propuesta declara que valores necesita
- [ ] 4.3 Una propuesta con una cifra literal donde iba un hueco se bloquea con motivo
- [ ] 4.4 Una propuesta cuyos huecos no tienen valor no se publica, y se dice cual falta
- [ ] 4.5 Prueba con el modelo doblado (`askModelToWrite`): prosa con cifras se bloquea, prosa con huecos se publica

## 5. La respuesta general se compone

- [ ] 5.1 La enumeracion de un nivel toma nombre y dato distintivo del catalogo
- [ ] 5.2 Cuando abarca varias ramas, cada opcion aparece con su rama
- [ ] 5.3 `buildScopeOptions` lee el dato del catalogo en vez de la prosa
- [ ] 5.4 Prueba: cambiar un precio cambia la enumeracion sin recompilar
- [ ] 5.5 Prueba: la composicion no reintroduce la mezcla de ramas sin nombrar

## 6. La tabla

- [ ] 6.1 Pantalla de catalogo por alcance: valores propios y los de sus descendientes
- [ ] 6.2 Cada fila con su procedencia visible
- [ ] 6.3 Edicion en linea con validacion por tipo
- [ ] 6.4 Un valor invalido no se guarda y se dice por que
- [ ] 6.5 Verificacion manual en el navegador antes de pedir revision

## 7. El editor de respuestas

- [ ] 7.1 Enlazar un dato del catalogo dentro de la frase
- [ ] 7.2 Vista renderizada con el valor real debajo del editor
- [ ] 7.3 Una respuesta guardada a mano con un hueco sin valor se marca incompleta
- [ ] 7.4 Verificacion manual en el navegador antes de pedir revision

## 8. Sustituir avisa

- [ ] 8.1 La pantalla de aprobacion lista los valores editados a mano que el material va a sustituir, con los dos valores
- [ ] 8.2 Sin correcciones que descartar no se muestra aviso
- [ ] 8.3 Prueba: aprobar deja el valor del material y el aviso lo habia dicho antes

## 9. Recorrido de aceptacion

- [ ] 9.1 Corrida real del compilador sobre el material de FYMSA: las respuestas publicadas llevan huecos, no cifras
- [ ] 9.2 Cambiar el precio de un modelo en la tabla cambia lo que contesta el bot, sin recompilar
- [ ] 9.3 El precio general del desarrollo refleja ese cambio en la misma conversacion
- [ ] 9.4 El runtime sigue sin llamar al modelo durante un mensaje
- [ ] 9.5 Ninguna prueba deja datos temporales
