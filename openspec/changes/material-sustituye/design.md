## Context

El compilador se construyo para convivir con el contenido anterior: aprobar una propuesta publicaba una respuesta al lado de las que ya estaban, y alrededor de esa convivencia crecio la maquinaria para administrarla —confirmacion por respuesta, candidatas a sustituir, panel de colisiones, historial de sustituciones—.

El cliente pidio lo contrario, y en sus palabras: *subo, reviso, apruebo, lo viejo se borra*. No hay merge. El material es el bot.

Estado local al escribir esto, que es la evidencia de que la convivencia no funciona:

```
Inmobiliaria FYMSA
  Altabrisa                  4 intenciones
  Europa                     4 intenciones      <- contenido anterior
  Residencial Europa         0 intenciones      <- lo que acuno la corrida
  Residencial Monteverde     (inactivo)

lead: "hola"              -> "...Europa, Altabrisa y Residencial Europa"
lead: "me interesa Europa" -> fallback: el alias es ambiguo
```

Ademas, cinco respuestas activas de la raiz siguen con los huecos de la plantilla sin llenar (`[X] modelos`, `[DIRECCIÓN EXACTA]`), y contestan cuando el lead no ha fijado el foco.

## Goals / Non-Goals

**Goals:**

- Que aprobar deje el bot diciendo el material y nada mas, en una sola operacion que no se puede quedar a medias.
- Que una corrida acepte el material del negocio completo, y que la estructura la deduzca el compilador y no el cliente separando archivos.
- Que la pantalla de aprobacion muestre solo lo nuevo.
- Que exista una salida explicita para el caso raro: anadir un desarrollo sin tocar lo demas.

**Non-Goals:**

- Interfaz para lo retirado. Las columnas de seguimiento se conservan y el editor de respuestas puede usarlas, pero este cambio no construye pantalla para ellas.
- Fusionar contenido anterior con compilado por cualquier criterio. No hay merge, ni automatico ni asistido.
- Desambiguacion enumerada, catalogo y variables: siguen siendo cambios aparte.

## Decisions

### La unidad que se aprueba es la corrida, no la propuesta

Hoy cada propuesta se aprueba por su cuenta y publica al instante. Eso hace imposible la atomicidad —el bot pasa por doce estados intermedios— y obliga a preguntar doce veces por la sustitucion.

Se separa en dos gestos:

- **Revisar**: sobre cada propuesta se puede editar el texto o rechazarla. Nada se publica.
- **Publicar**: un solo gesto aplica la corrida entera. Es donde ocurre la sustitucion.

Alternativa descartada: conservar la aprobacion por propuesta y hacer la sustitucion en la ultima. Deja el resultado dependiendo del orden en que se pulsen los botones, que es precisamente lo que produjo la base de hoy.

### Retirar es desactivar, no borrar filas

De cara al cliente y al lead el efecto es el que pidio: lo anterior desaparece de la conversacion y de la pantalla. En la base se marca inactivo.

No es una preferencia: `appointments`, `user_checkpoints`, `agent_config`, `appointment_config` y `resources` referencian `scopes.id` con **RESTRICT**. Un lead con una cita agendada fija su alcance. Borrar la fila haria fallar la sustitucion justo en los negocios con actividad, que son todos los que importan. Lo mismo para `bot_responses` cuando existe historial de sustitucion.

La consecuencia practica: `inactive_reason = 'material_replacement'` marca lo retirado, y el editor de respuestas sigue pudiendo mostrar que fue de una respuesta anterior. Ninguna consulta del runtime lo ve.

### El ambito lo define el arbol aprobado de la corrida

En modo sustituir, se retira todo el contenido y todos los alcances que cuelgan del alcance de la corrida y **no** aparecen en su arbol aprobado. Para el caso normal —una corrida en la raiz con el material del negocio— eso es todo lo anterior.

El alcance raiz nunca se retira: es el negocio, no un desarrollo.

Alternativa descartada: retirar por rama reconociendo cual es cual por nombre. Es el merge que el cliente rechazo, y ademas hace falso el caso que importa —un desarrollo que dejo de venderse desaparece del material y tiene que desaparecer del bot—.

### El modo vive en la corrida

`compiler_runs.replacement_mode`, valores `replace` y `add`, por omision `replace`. Se elige al abrir la corrida y viaja con ella, de modo que la pantalla de publicar puede decir cual de las dos cosas va a pasar sin adivinarlo.

En modo `add` no se retira nada: la corrida solo suma lo suyo. Sigue valiendo la regla de una respuesta activa por pregunta y alcance, asi que si el material anadido cubre una pregunta que ya existia **en ese mismo alcance**, la sustituye ahi y solo ahi.

### Una sola funcion de base hace la sustitucion

Toda la operacion —retirar contenido, retirar alcances, publicar respuestas, encender intenciones, escribir alias— ocurre dentro de una funcion en una transaccion. Si algo falla, la base revierte y el bot queda como estaba.

Es la misma razon por la que `replace_scoped_compiler_proposals` ya es una funcion: hacerlo desde la aplicacion en varias llamadas deja estados intermedios visibles para un lead que escribe en ese segundo.

### El foco que apunta a algo retirado se suelta

`user_sessions.current_scope_id` puede quedar apuntando a un alcance que la sustitucion desactivo. Ya existe `scopeRepository.isReachableScope`: al resolver el foco, si el alcance no es alcanzable, se suelta y la conversacion se resuelve desde el negocio.

No se reescriben las sesiones durante la sustitucion. Tocar filas de leads dentro de la transaccion la alarga y no hace falta: basta con que el runtime no confie en un foco muerto.

### Los alias se proponen con la estructura

El material dice "Residencial Europa, tambien conocido como Europa". La estructura propone un alcance con los dos nombres, y al publicar se escriben en `scope_aliases`, que ya existe y ya lo consume el ruteo. Es lo que evita que el lead escriba "Europa" y caiga al fallback.

## Risks / Trade-offs

- **Un cliente recompila y pierde ediciones que hizo a mano** → Es lo pedido. Se mitiga diciendolo antes: la pantalla de publicar informa cuantas respuestas se retiran y cuantas de ellas tienen `edited_by_human`, y publicar es un gesto explicito.

- **Modo sustituir con material incompleto borra desarrollos vivos** → Antes de publicar, la pantalla nombra los desarrollos que dejan de ofrecerse. Un cliente que solo queria anadir uno lo ve ahi y cambia de modo.

- **La sustitucion es una transaccion larga y bloquea escrituras sobre `bot_responses`** → El volumen es de decenas de filas, no de miles. Si creciera, la salida es preparar las filas nuevas antes y dejar en la transaccion solo el cambio de banderas.

- **Queda contenido inactivo acumulandose corrida tras corrida** → Es invisible para el runtime y para la aprobacion. Si algun dia estorba, se retira por antiguedad en un mantenimiento aparte; no se resuelve inventando interfaz ahora.

- **Una corrida en `add` sobre un negocio vacio se comporta igual que `replace`** → No es un problema: no hay nada que retirar. Se documenta para que nadie lo lea como un fallo.

## Migration Plan

1. Migracion aditiva: `replacement_mode` en `compiler_runs` con `DEFAULT 'replace'`, y la funcion de sustitucion. Se retira `resolve_response_collision`, que no tiene datos colgando.
2. El codigo nuevo convive con las corridas anteriores: las que ya existen quedan en `replace`, y las que ya publicaron no se tocan.
3. Reversion: volver a la version anterior del panel y de la funcion de aprobacion. Lo retirado sigue en la base con su motivo, asi que reactivarlo es una consulta.

## Open Questions

- Si una corrida en modo sustituir no cubre una pregunta que hoy tiene respuesta —el material no habla de mascotas y antes habia una respuesta escrita a mano—, esa respuesta se retira igual, porque el material es el bot. Queda anotado por si al recorrerlo el cliente prefiere lo contrario.
