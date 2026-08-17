# Material de prueba del compilador

Textos para recorrer el onboarding sin depender de un PDF de cliente. Se pegan
en el campo de texto del paso 1, o se guardan como `.txt` y se suben.

## `fymsa-europa.txt` y `fymsa-altabrisa.txt` — el caso de aceptacion

El material del que tiene que salir la conversacion de
`openspec/conversacion-objetivo.md`, **compilando y no sembrando**. Esa es la
diferencia que importa: `scripts/seed-fymsa.ts` inserta el contenido a mano y
sirve para ejercitar el runtime, pero no demuestra nada sobre el compilador,
que es justamente lo que falla. Un cliente real no inserta filas: sube un
documento.

Se compilan por separado, uno por desarrollo, como haria una inmobiliaria con
dos catalogos.

Lo que estos dos ejercitan y los otros no:

| Que contienen | Que prueba |
|---|---|
| "Inmobiliaria FYMSA" en el encabezado y en "Quienes somos" | Que el negocio se distinga del desarrollo |
| Precio, terreno y construccion por modelo | Contenido en el alcance del modelo, no en el del desarrollo |
| Amenidades marcadas "para todo el desarrollo" | Que suban al desarrollo en vez de repetirse |
| Direccion y horario, distintos en cada uno | Herencia hacia arriba, y que dos desarrollos no se pisen |
| Europa dice **casas** y **lotes de terreno**; Altabrisa solo casas | Que el vocabulario del matcher salga del material y no de lo sembrado. Hoy la intencion sembrada conoce "departamentos" y no "casas", asi que "que casas manejan" cae al fallback |
| Altabrisa dice explicitamente que no vende terrenos | Que no se invente lo que el material niega |
| Cuenta, CLABE, comision y margen, solo en Europa | La marca de dato sensible |

Lo que deliberadamente no dicen, para que salga como hueco de cobertura:
mascotas, gastos de escrituracion y si hay casa muestra.

## `monteverde.txt` — el caso completo

Un desarrollo con tres modelos. Cada bloque existe para ejercitar algo:

| Qué contiene | Qué prueba |
|---|---|
| "Grupo Inmobiliario Altavista" en el encabezado y en "Sobre nosotros" | Que el nombre del negocio se deduzca y no se confunda con el del desarrollo |
| "también conocido como Monteverde o Privada Monteverde" | Los alias con los que un lead menciona el desarrollo, para el ruteo |
| Toscana, Milano y Verona con precio y superficie propios | La propuesta de estructura con partes, y la atribución de cada hecho a la suya |
| El bloque de amenidades dice "aplican a todos los modelos" | Que el hecho compartido suba al desarrollo en vez de repetirse en cada modelo |
| Toscana aparece con `$1,850,000` y más abajo con `$1,795,000` | La detección de contradicción y la señal de revisión |
| Cuenta bancaria, CLABE, comisión, margen y costo por lote | La marca de dato sensible: nada de eso debe salir en una respuesta |
| "15 de noviembre de 2026" | Un hecho de tipo fecha |
| Horario de atención | Un hecho que suele quedar en la configuración y no en el contenido |

**Lo que deliberadamente no dice**, para que aparezca en "qué falta por cubrir":
mascotas, gastos de escrituración, cuota de mantenimiento y si hay casa muestra.

Para probar el aplanado —"Lo vendo todo junto"— usa este mismo texto y elige
esa opción en lugar de confirmar los tres modelos.

## `torre-lumen.txt` — el caso plano

Un producto sin modelos, del mismo negocio. Dos usos:

- Solo: el compilador no debería proponer partes, y el paso de estructura debe
  resolverse sin pedir nombres de opciones.
- Después de Monteverde: da de alta un segundo desarrollo y permite comprobar
  que el ruteo por mención distingue "monteverde" de "lumen", que el saludo
  compuesto nombra a los dos, y que el alta del segundo no toca el contenido
  del primero.

Trae "Fraccionamiento Lomas de Ocuiltzapotlán" dentro de una dirección a
propósito: es la clase de nombre propio que una sustitución de vocabulario por
búsqueda de palabras reescribía, y que hoy debe llegar literal al lead.

## Vocabulario y tono

Ninguno de los dos textos condiciona esas dos respuestas, así que se pueden
recorrer con cualquier combinación:

- Monteverde encaja con "fraccionamiento"; Torre Lumen con "proyecto". Elegir
  el que no encaja sirve para ver dónde aparece la palabra en la interfaz.
- El tono se juzga sobre las muestras renderizadas con el precio real del
  material, así que conviene elegirlo después de que el material se haya leído.
