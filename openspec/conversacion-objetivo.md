# Conversación objetivo

Documento de referencia para las specs que faltan. Define **qué tiene que poder
conversar el bot** y sirve de criterio de aceptación: ninguna de esas specs se da
por terminada hasta que sus turnos pasen.

Aprobado con Leonardo el 2026-08-16. Lo que dice el apartado "estado real" no es
estimación: sale de correr `scripts/simulate-fymsa.ts` contra el stack local.

---

## 1. El caso

Inmobiliaria **FYMSA**, con dos desarrollos:

```
Inmobiliaria FYMSA
├─ Europa
│  ├─ Modelo Aura
│  ├─ Modelo Vento
│  ├─ Modelo Solara
│  └─ Terrenos
└─ Altabrisa
   ├─ Modelo Cala
   └─ Modelo Mare
```

Amenidades, ubicación y horario viven en el **desarrollo**. Precio y
características viven en cada **modelo**. Esa asimetría es deliberada: es la que
obliga a que la herencia funcione.

---

## 2. La conversación

```
Lead  Hola
Bot   Hola. Soy el asistente de Inmobiliaria FYMSA.
      Puedo ayudarte con Europa y Altabrisa.
      Respondo tus dudas y te ayudo a agendar una visita.

Lead  ¿Cuánto cuestan?
Bot   ¿De cuál desarrollo?
      [ Europa ]  [ Altabrisa ]

Lead  Europa
Bot   En Europa las casas van desde {precio_min_casas} y los terrenos
      desde {precio_min_terrenos}.
      ¿Cuál te muestro?
      [ Aura · 3 rec · $1.85M ]  [ Vento · 3 rec · $2.34M ]
      [ Solara · 4 rec · $2.98M ]  [ Terrenos · desde $780K ]

Lead  Solara
Bot   Modelo Solara: desde {precio}. Terreno de {terreno} y construcción
      de {construccion}, {recamaras} recámaras y {banos} baños.

Lead  ¿Dónde está?
Bot   Europa está en {direccion}.

Lead  ¿Qué amenidades tiene?
Bot   Europa tiene caseta de vigilancia 24/7, alberca semiolímpica y casa club.

Lead  ¿Y en Altabrisa cuánto cuesta?
Bot   En Altabrisa las casas van desde {precio_min_casas}.
      ¿Cuál te interesa?  [ Cala ]  [ Mare ]

Lead  precio de Cala
Bot   Modelo Cala: desde {precio}, {recamaras} recámaras.

Lead  Quiero agendar
Bot   ¿Qué día te queda bien para visitar Altabrisa?
```

Los turnos 5 y 6 responden desde **Europa** aunque el foco esté en Solara: la
ubicación y las amenidades no se definen en el modelo y se heredan. El turno 7
cambia de desarrollo por mención y contesta ahí, sin arrastrar nada de Solara.

### Escenas complementarias

**No toda pregunta necesita foco**
```
Lead  ¿Qué desarrollos manejan?
Bot   Manejamos Europa y Altabrisa, los dos en Villahermosa. ¿De cuál te cuento?
```

**El lead cambia de tema con una pregunta pendiente**
```
Lead  precio
Bot   ¿De cuál desarrollo?  [ Europa ]  [ Altabrisa ]
Lead  ¿dónde queda Altabrisa?
Bot   Altabrisa está en Prolongación Paseo Tabasco 1503...
```
Contesta lo que el lead acaba de escribir, no la pregunta retenida.

**Un solo desarrollo**
```
Lead  ¿Cuánto cuestan?
Bot   Las casas van desde $1,850,000 y los terrenos desde $780,000.
      ¿Cuál te muestro?  [ Aura ]  [ Vento ]  [ Solara ]  [ Terrenos ]
```
Con un solo desarrollo no pregunta por desarrollo, pero **sí baja** al nivel
donde hay duda.

**Algo que el material no dice**
```
Lead  ¿aceptan mascotas?
Bot   Esa no la tengo. Le paso tu pregunta a un asesor y te contactan hoy.
      Mientras, ¿te ayudo con algo de esto?
      [ Precios ]  [ Ubicación ]  [ Agendar visita ]
```

### Fuera de alcance, a propósito

Preguntas combinatorias abiertas —"algo para una familia de 5 sin pasar de 3
millones y cerca de escuelas"— van al asesor. **El runtime no lleva LLM.** La
lista de opciones con el dato encima recupera buena parte de ese caso por
navegación: quien buscaba tres recámaras hasta dos millones ya lo ve sin
preguntarlo.

---

## 3. Estado real hoy

`scripts/simulate-fymsa.ts` siembra el catálogo con el contenido que un
compilador ideal habría producido —intenciones propias por alcance— y manda los
turnos a `messageProcessor`. **Pasan 7 de 10.**

| Turno | Hoy |
|---|---|
| Hola | Parcial: enumera los dos, pero saluda con el texto sembrado de "Europa" |
| ¿Cuánto cuestan? | Pasa |
| Europa | Pasa el precio general; **no ofrece el siguiente nivel** |
| **Solara** | **Falla: cae al fallback** |
| ¿Dónde está? | Pasa, heredando |
| ¿Qué amenidades tiene? | Pasa |
| ¿Y en Altabrisa cuánto cuesta? | Pasa |
| precio de Cala | Pasa |
| ¿la más barata con 3 recámaras? | **Falla: contesta plantilla sin llenar** |
| Quiero agendar | Pasa |

### Los tres que fallan

**"Solara" no es un problema de foco.** La simulación imprime el estado:

```
Lead  Solara
      [foco: Modelo Solara | pendiente: ninguna | fallback: si]
```

El foco entró correctamente. Lo que falta es una pregunta que contestar: el
turno anterior respondió en vez de preguntar, así que no quedó nada retenido, y
un alcance mencionado a secas hoy no significa nada.

**El turno combinatorio no se rinde**, que es peor que fallar: empareja con la
intención `modelo` y devuelve la plantilla sembrada con `[X] modelos`,
`[XX]m²` y `Desde $XXX,XXX MXN` literales.

**El saludo** compuesto existe pero exige la marca configurada; sin ella sale el
texto sembrado.

---

## 4. Las reglas

### De conversación

1. Nunca preguntar lo que ya se sabe. Con foco puesto, contestar.
2. Preguntar solo donde hay duda real, al nivel donde las respuestas difieren.
3. Contestar lo que sí es cierto antes de preguntar: el rango primero, el
   detalle después.
4. Lo que no cambia se hereda desde el desarrollo.
5. Lo último que escribe el lead manda sobre cualquier pregunta pendiente.
6. Mencionar un alcance a secas equivale a repetir ahí la última pregunta.

### De oferta

Hoy la lista de afirmativos (`si, sí, claro, ok, dale, adelante, …`) vive solo
dentro del flujo de cita, y `si` está además en las palabras vacías del matcher:
se elimina antes de comparar. Fuera de la oferta de cita, un "sí" no coincide
con nada. Por eso "¿te interesa ver los planos?" es un callejón.

1. Toda oferta deja constancia de qué ofreció.
2. Los afirmativos solo resuelven contra una oferta pendiente. Sin oferta viva,
   la respuesta es "¿sí a qué?" con las opciones, no el fallback genérico.
3. Preferir ofertas que traigan su propio referente: *"¿Cuál te muestro: Aura,
   Vento o Solara?"* en vez de *"¿Te interesa ver los modelos?"*.
4. Una respuesta que termina en pregunta de sí/no y no declara su oferta **no se
   puede aprobar**.

### De formato

El límite lo impone WhatsApp:

| Opciones | Formato |
|---|---|
| hasta 3 | botones de respuesta |
| 4 a 10 | mensaje de lista |
| más de 10 | no se puede enumerar: estrechar antes por ciudad o rango de precio |

**El camino ya existe entero.** `sendInteractiveButtons` manda botones a WhatsApp
hoy, en el flujo de cita, y `extractMessage` entiende `button_reply` y
`list_reply` convirtiendo el toque en el **identificador** del botón, no en su
título. Es exactamente la propiedad que hace determinista la desambiguación sin
LLM: en ese paso no hay coincidencia difusa ni ambigüedad posible. Lo que falta
no es el transporte, es generar las opciones desde el catálogo.

Solo botones **generados desde el catálogo**. Los botones redactados a mano son
un grafo de conversación —destino, ciclos, destino borrado— y quedan para
después.

### De nombres repetidos

Si dos desarrollos tienen un modelo con el mismo nombre, se **asume el foco**, y
el compilador antepone el desarrollo en la prosa de ambos automáticamente
("Modelo Cala de Europa: …"). Único caso que aún exige preguntar: mención
ambigua sin foco previo.

---

## 5. Las dos pantallas

### El árbol dentro de la pregunta

Una página por pregunta. La lista de intenciones deja de repetirse: hay una
"Precio y Costos", no cuatro.

```
Precio y Costos                                        [ Patrones ]

RESPUESTA GENERAL - Europa
  "En Europa las casas van desde {precio_min_casas}..."
  Se usa cuando el lead aún no dijo de cuál habla.

POR MODELO
  Modelo Aura     [ propia ]   "desde {precio}, {recamaras} recámaras"
                               ← brochure.pdf, pág. 2      [ Editar ]
  Modelo Vento    [ propia ]   ...
  Modelo Solara   [ propia ]   ...
  Terrenos        [ hereda la general ]      [ Escribir una ]
```

Una **pregunta**, N **respuestas** (una por alcance). En la base son N filas con
la misma `intent_name` y distinto `scope_id`; `resolveRows` elige por foco. El
lead nunca recibe más de una.

"Hereda" es un estado, no un hueco: quien no tiene respuesta propia contesta la
general, y borrar una propia devuelve a heredar.

### La tabla del catálogo

No existe. Sin ella, cambiar un precio obliga a recompilar un PDF.

```
Europa                                  [ Actualizar desde documento ]

              Precio       Recámaras  Baños  Const.   Disponibilidad
Modelo Aura   $1,850,000       3        2    118 m2   Disponible
Modelo Vento  $2,340,000       3        3    152 m2   Disponible
Modelo Solara $2,980,000       4        4    198 m2   Agotado
Terrenos      $780,000         -        -    160 m2   Disponible

Dirección   Av. Ruiz Cortines 1820, Col. Tamulté   ← brochure.pdf p.1
Horario     L-S 9-18, D 10-15                      ← brochure.pdf p.1
```

En el editor de la respuesta **nunca se escribe un número**: se escribe la frase
y se enlaza el dato. Debajo se ve renderizada con el valor real.

---

## 6. Por qué hace falta lo que hace falta

El runtime está en mejor forma que el compilador. La herencia, el cambio de
foco, la pregunta retenida y "precio de Cala" en un turno ya funcionan. Lo que
no existe es quien llene el contenido:

```ts
// generateContent
const intents = await documentCompilerRepository.getVisibleIntents(run.scope_id);
// resuelve hacia la raíz: devuelve las intenciones de la raíz

if (!intent || !proposal) return [];
// lo que no está entre las 9 intenciones sembradas se tira en silencio

scopeId: run.scope_id,   // todo al desarrollo, nada a los modelos
intentId: intent.id,     // el id de la intención RAÍZ
```

De ahí salen tres efectos observados en la base local: nada se escribe nunca en
un modelo; dos desarrollos compilados escriben sobre la misma intención; y
`precio` en la raíz acumula tres respuestas activas que **el runtime manda todas
seguidas**, la compilada y la sembrada que habla de un desarrollo que ya no
existe.

---

## 7. El criterio es compilar, no sembrar

El contenido de esta conversación tiene que salir de **compilar un documento**,
no de insertarlo a mano. `scripts/seed-fymsa.ts` lo siembra y sirve para
ejercitar el runtime mientras el compilador no sabe escribir por alcance, pero
no demuestra nada sobre el compilador. Un cliente real no inserta filas.

El material está en `scripts/fixtures/compiler/fymsa-europa.txt` y
`fymsa-altabrisa.txt`, uno por desarrollo. El recorrido de aceptación es:

```
subir el material -> compilar -> aprobar -> conversar en el simulador
```

Y de ahí sale también el vocabulario del matcher. Hoy la intención sembrada
`modelo` conoce `departamento, departamentos` y **no** conoce `casa, casas`,
porque la sembró quien vendía departamentos: por eso "que casas manejan" cae al
fallback. Añadir la palabra a mano no lo arregla —el próximo cliente vende
bodegas—; el vocabulario tiene que salir del material, como sale el contenido.

## 8. Hallazgos del primer recorrido manual

Del 2026-08-17, recorriendo el simulador. Los tres primeros ya tienen spec; los
dos últimos no la tenían.

- **El foco es una puerta de un solo sentido.** Entra por mención y no sale.
  Saludar con el foco en un modelo hace que el bot ofrezca los dos desarrollos
  mientras sigue contestando desde uno de ellos.
- **Un alcance a secas cae al fallback**, aunque el foco sí se mueva. Confirmado
  en modelo (`Solara`) y en desarrollo (`Altabrisa`).
- **El brochure promete un archivo que no llega**: `*Enviando archivo...*`.
- **Pedir otro no existe.** `otro desarrollo?` y `Precio de otro modelo` caen al
  fallback o —peor— repiten el alcance en foco. Regla nueva: pedir otro es
  pedir los hermanos, y gana sobre el foco pegado igual que una mención.
- **Saludar suelta el foco.** Un saludo es el lead empezando de nuevo.

## 9. Cómo verificar

```bash
npx tsx scripts/simulate-fymsa.ts
```

Siembra FYMSA, desactiva los desarrollos existentes mientras corre, manda los
turnos, imprime lo que el bot contesta con su foco y su pregunta pendiente, y
restaura todo al terminar.

Para probar a mano, `POST /api/test/process-message` ejecuta el procesador y
devuelve la respuesta sin enviarla por WhatsApp.
