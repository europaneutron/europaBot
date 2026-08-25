# Respuestas: Europa Residencial y Malasia Residencial

Organizado por **intención** (la pregunta que el bot detecta), con el
alcance donde va cada respuesta. Cada respuesta viene partida en **bloques**
— así se manda hoy en el bot real: cada bloque es una burbuja de WhatsApp
aparte, con una pausa antes de la siguiente, en vez de un mensaje-muro. Eso
es exactamente lo que el editor de bloques del panel espera: un bloque de
texto por burbuja.

Cada bloque está en texto plano, listo para copiar y pegar tal cual — sin
nada del formato de este archivo `.md`. Donde hay negritas, ya están en
formato de WhatsApp (`*así*`, un solo asterisco — dos asteriscos no negrean
nada ahí).

Nada de esto está cargado en el panel todavía. Es el borrador para revisar,
ajustar el tono donde no te suene, y capturarlo tú.

**Antes de nada, una diferencia que cambia todo el enfoque:**

| | Europa Residencial | Malasia Residencial |
|---|---|---|
| A quién le vendes | Cliente final, individual | Constructoras / desarrolladores |
| Qué compra | 1 lote o 1 casa | Mínimo 5 lotes |
| Precio | Fijo: $700,000 (lote) / $2,300,000 (casa) | Negociable |
| Crédito | Infonavit, bancario, recursos propios | No hay — todo se negocia directo |
| Entrega | Lote: inmediata · Casa: ~4 meses | ~3 meses (octubre 2026) |

Son dos negocios distintos dentro del mismo bot: uno es venta al menudeo, el
otro es venta por volumen. Por eso el cruce entre ambos no es "también
tenemos esto" a secas — es **redirigir a quien no es el cliente correcto**:
si preguntan precio de Malasia como particular, seguramente buscan Europa; si
preguntan precio de Europa para revender o construir varias casas, Malasia es
lo que necesitan.

Donde una idea se repite en dos bloques distintos —por ejemplo, mencionar
Europa tanto en el bloque de precio de Malasia como en el de cierre— es a
propósito: en WhatsApp cada burbuja se lee un poco aislada de la anterior, y
repetir el nombre del otro desarrollo ayuda a que el lead no se pierda a
media conversación.

---

## `saludo` — ya está bien, sin cambios

El que pegaste como referencia de tono funciona. Se queda igual.

---

## `precio`

### Europa Residencial

Ahora son dos productos, no uno — hay que decirlo desde la primera respuesta
o el lead compara mal.

**Bloque 1**
```
🏡 En Europa Residencial tenemos dos formas de hacerte de tu patrimonio:
```

**Bloque 2**
```
*Lotes* — listos para entrega inmediata
💰 $700,000 MXN
```

**Bloque 3**
```
*Casas en preventa* — construcción bajo pedido, entrega en ~4 meses
💰 $2,300,000 MXN
```

**Bloque 4**
```
Mismas medidas, mismos créditos disponibles para las dos opciones.

¿Cuál te interesa más?
```

**Botones** (3, formato botones):
- `Ver lotes` → detalle del lote (medidas, entrega inmediata)
- `Ver casas` → detalle de la casa en preventa
- `Créditos` → intención `creditos`

*Nota técnica:* hoy el catálogo tiene un solo `precio`/`tiempo_entrega` por
alcance (700,000 / "4 meses aproximadamente" — que en realidad es el dato de
la **casa**, no del lote). Con dos productos hace falta separar en el
Catálogo: `precio_lote` ($700,000 / inmediata) y `precio_casa` ($2,300,000 /
~4 meses), o vivir con texto fijo como el de arriba. Te lo señalo para que no
se quede mezclado.

### Malasia Residencial

**Bloque 1**
```
🏗️ En Malasia Residencial manejamos venta por volumen, pensada para constructoras y desarrolladoras.
```

**Bloque 2**
```
💰 $700,000 MXN por lote, abierto a negociación — enganche, precio y plazos se acuerdan directo contigo.
```

**Bloque 3**
```
📦 Compra mínima: 5 lotes.
🚫 Por ahora no manejamos crédito — todo se resuelve en la negociación.
📅 Entrega estimada: octubre 2026 (~3 meses).
```

**Bloque 4**
```
Si buscas un solo lote o una casa para vivir, mejor te platico de Europa Residencial 👇
```

**Botones** (2):
- `Negociar términos` → `cita` (o el flujo que uses para el trato con constructoras, ver nota al final)
- `Ver Europa` → cambia el foco a Europa Residencial, contesta `precio` ahí

### Respuesta padre (opcional, en Inmobiliaria Fymsa)

Tú decides si la colocas. Ojo con lo que hace si la pones: hoy, sin
respuesta propia en la raíz, el bot pregunta automáticamente "¿de cuál
desarrollo?" con botones Europa/Malasia — que es casi lo mismo que esto,
solo que como pregunta y no como afirmación. Ponerla aquí no cambia mucho el
resultado, pero si prefieres que la primera respuesta ya venga con contexto
en vez de una pregunta pelada, esta es la opción:

**Bloque 1**
```
💰 Manejamos dos tipos de venta, según lo que busques:
```

**Bloque 2**
```
🏡 Compra individual (lote o casa) → Europa Residencial, desde $700,000 MXN.
```

**Bloque 3**
```
🏗️ Compra por volumen para constructoras → Malasia Residencial, desde $700,000 MXN por lote, negociable.
```

**Bloque 4**
```
¿Cuál se ajusta a lo que necesitas?
```

**Botones** (2): `Europa Residencial` → fija foco, contesta `precio` ahí · `Malasia Residencial` → fija foco, contesta `precio` ahí

---

## `modelo` — características físicas del lote/casa

Hoy `modelo` vive solo en la raíz con texto de plantilla ("[X] modelos...").
Sugiero moverlo a cada desarrollo con esto:

### Europa Residencial

**Bloque 1**
```
📐 Los lotes de Europa Residencial miden 7 × 14 m (98 m²), completamente urbanizados y se entregan con servicios de agua y luz.
```

**Bloque 2**
```
Si prefieres no construir tú, tenemos casas en preventa con las mismas medidas de terreno, listas en ~4 meses.
```

**Botones** (2):
- `Ver casas en preventa` → detalle de la casa
- `Ubicación` → intención `ubicacion`

### Malasia Residencial

**Bloque 1**
```
📐 Los lotes de Malasia también son de 7 × 14 m (98 m²), urbanizados.
```

**Bloque 2**
```
Como es venta por volumen, la entrega y los acabados se afinan según el proyecto de cada constructora.
```

**Botón** (1 — es más una aclaración que una elección):
- `Negociar términos` → `cita`

### Respuesta padre (opcional, en Inmobiliaria Fymsa)

Este sí es un buen candidato de verdad: la medida del lote (7 × 14 m, 98 m²)
es literalmente el mismo dato en los dos desarrollos, así que no es forzar
una respuesta genérica — es un hecho compartido de verdad. Ponerla aquí
evita repetir el mismo número dos veces y deja la pregunta abierta para lo
que sí cambia.

**Bloque 1**
```
📐 Los lotes de nuestros dos desarrollos miden 7 × 14 m (98 m²), completamente urbanizados.
```

**Bloque 2**
```
Lo que cambia es el tipo de venta y las condiciones — ¿de cuál te gustaría saber más?
```

**Botones** (2): `Europa Residencial` → fija foco, contesta `modelo` ahí · `Malasia Residencial` → fija foco, contesta `modelo` ahí

---

## `ubicacion`

### Europa Residencial

**Bloque 1**
```
📍 Europa Residencial está en Carretera Villahermosa–Nacajuca Km 3.5, Saloya 2da Sección, Tabasco.
```

**Bloque 2**
```
🔗 Aquí el mapa directo: {enlace_ubicacion}
```

**Bloque 3**
```
🕐 Puedes visitarnos de lunes a domingo, de 9:00 am a 6:00 pm — o si prefieres, te agendo una visita con gusto.
```

**Botones** (2):
- `Agendar visita` → `cita`
- `Ver Malasia` → cambia el foco, contesta `ubicacion` en Malasia *(solo si te interesa mostrarla — si el visitante ya se perfiló como particular, mejor omitir este botón y dejar únicamente `Agendar visita`)*

### Malasia Residencial

**Bloque 1**
```
📍 Malasia Residencial está sobre la Carretera Villahermosa–Nacajuca, km 4.
```

**Bloque 2**
```
Si tu proyecto es de venta al menudeo en vez de desarrollo, seguramente Europa Residencial (km 3.5, mismo tramo) se ajusta mejor a lo que buscas.
```

**Botones** (2):
- `Negociar términos` → `cita`
- `Ver Europa` → cambia el foco, contesta `ubicacion` en Europa

*Nota:* no me diste horario ni link de mapa para Malasia — si existen,
dímelos y los agrego con el mismo formato que Europa.

### Respuesta padre (opcional, en Inmobiliaria Fymsa)

Otro candidato real: los dos desarrollos están sobre la misma carretera, a
medio kilómetro uno del otro — son prácticamente vecinos. Vale la pena
decirlo junto, aunque el mapa y el horario detallado se queden en cada uno.

**Bloque 1**
```
📍 Los dos desarrollos están sobre la Carretera Villahermosa–Nacajuca: Europa Residencial en el km 3.5, Malasia Residencial en el km 4 — prácticamente vecinos.
```

**Bloque 2**
```
¿De cuál te gustaría el mapa y los detalles?
```

**Botones** (2): `Europa Residencial` → fija foco, contesta `ubicacion` ahí · `Malasia Residencial` → fija foco, contesta `ubicacion` ahí

---

## `amenidades` (intención nueva)

Es información propia, distinta de `seguridad` y de `ubicacion`, y las dos
listas de amenidades son diferentes entre desarrollos — vale la pena que sea
su propia pregunta. La creas igual que cualquier otra en `/intents/new`.

### Europa Residencial

**Bloque 1**
```
🌴 Dentro de Europa Residencial vas a encontrar:
```

**Bloque 2**
```
• 2 albercas
• Salón de eventos
• Cancha de usos múltiples
• Área de juegos
• Áreas verdes
• Plaza comercial
```

**Bloque 3**
```
Todo dentro de un fraccionamiento con vigilancia 24/7 y acceso controlado.
```

**Sin botones** (o solo `Agendar visita` si quieres cerrar con esa invitación
en cada respuesta larga).

### Malasia Residencial

**Bloque 1**
```
🌴 En Malasia Residencial tenemos:
```

**Bloque 2**
```
• Salón social
• Alberca
• Área de juegos
• Cancha de pádel
• Áreas verdes
```

**Bloque 3**
```
Menos plaza comercial que Europa, pero con cancha de pádel, que Europa no tiene — buena carta si tu comprador juega 🎾
```

**Botón** (1): `Negociar términos` → `cita`

*Sin respuesta padre a propósito:* las dos listas son distintas de verdad
(Europa tiene plaza comercial y dos albercas; Malasia tiene cancha de pádel).
Una respuesta compartida tendría que ser tan genérica que no diría nada útil.

---

## `seguridad`

### Europa Residencial

**Bloque único**
```
🔒 En Europa Residencial contamos con vigilancia 24/7 y acceso controlado, dentro de un fraccionamiento privado. Tu tranquilidad, incluida.
```

**Sin botones**, o `Ver amenidades` si prefieres encadenar.

### Malasia Residencial

No me diste este dato para Malasia. Si el acceso es distinto (por ejemplo,
al ser lotes en desarrollo puede que la vigilancia formal empiece hasta que
haya construcción), dime cómo describirlo y te lo redacto igual de corto.

*Sin respuesta padre por ahora:* falta saber si el dato de Malasia es
siquiera parecido al de Europa. Sin eso no hay nada real que compartir.

---

## `creditos`

### Europa Residencial

**Bloque 1**
```
💳 Para las dos opciones —lote o casa— aceptamos:
```

**Bloque 2**
```
• Recursos propios
• Crédito bancario
• Infonavit
```

**Bloque 3**
```
Si gustas, revisamos tu crédito sin costo con nuestro bróker 🤝, y también tenemos contacto directo con asesores bancarios para orientarte.
```

**Botones** (2):
- `Revisar mi crédito` → `cita` (o el flujo del bróker si es distinto)
- `Ver precios` → `precio`

### Malasia Residencial

**Bloque 1**
```
🤝 En Malasia no manejamos crédito bancario ni Infonavit, porque es venta directa por volumen: el enganche, el precio y los plazos se negocian caso por caso contigo.
```

**Bloque 2**
```
Si buscabas comprar para vivir o con crédito, en Europa Residencial sí manejamos Infonavit y crédito bancario 👇
```

**Botón** (1): `Ver Europa` → cambia el foco, contesta `creditos` en Europa

*Sin respuesta padre a propósito:* aquí no hay dato compartido, hay lo
opuesto — uno sí financia y el otro no. Cualquier mensaje que los mezcle
sería impreciso para los dos.

---

## `promociones` (intención nueva)

Vale la pena tenerla aparte de `precio`: es la típica pregunta suelta
("¿tienen alguna promo?") y hoy no hay dónde contestarla.

### Sugerido en la raíz (Inmobiliaria Fymsa), para que la hereden los dos

**Bloque 1**
```
😊 Por ahora no tenemos promociones vigentes, pero en cuanto haya alguna te la comparto con gusto.
```

**Bloque 2**
```
Mientras tanto, ¿te platico de precios o de financiamiento?
```

**Botones** (2): `Precios` → `precio` · `Créditos` → `creditos`

---

## `brochure` — el resumen que cruza los dos desarrollos

Hoy el texto sembrado en Europa y Malasia menciona "Europa" a secas y
pregunta "¿de cuál desarrollo?" — es justo el lugar natural para el cruce,
porque es la pregunta de "cuéntame todo" antes de que el lead se haya
decantado por ninguno.

### En la raíz (Inmobiliaria Fymsa)

**Bloque 1**
```
📄 Con gusto — manejamos dos desarrollos, para necesidades distintas:
```

**Bloque 2**
```
🏡 *Europa Residencial* — lotes y casas, venta individual, con crédito.
```

**Bloque 3**
```
🏗️ *Malasia Residencial* — venta por volumen para constructoras, desde 5 lotes.
```

**Bloque 4**
```
¿Cuál se ajusta más a lo que buscas?
```

**Botones** (2): `Europa Residencial` → fija foco en Europa, contesta `brochure` ahí · `Malasia Residencial` → fija foco en Malasia, contesta `brochure` ahí

---

## Resumen de botones nuevos que vas a necesitar declarar

Ninguno de estos existe todavía como opción — al escribir cada respuesta en
`/intents/<pregunta>/responses`, estos son los botones a mano que sugiero:

| Botón | Va en | Lleva a |
|---|---|---|
| Ver lotes / Ver casas | `precio` Europa | Precio de cada producto |
| Ver Malasia | `precio`, `ubicacion`, `creditos` de Europa | Misma pregunta, foco en Malasia |
| Ver Europa | `precio`, `ubicacion`, `creditos` de Malasia | Misma pregunta, foco en Europa |
| Negociar términos | Casi toda respuesta de Malasia | `cita` |
| Agendar visita | Respuestas de Europa | `cita` |
| Revisar mi crédito | `creditos` Europa | `cita` (o el flujo del bróker si es distinto) |

## Lo que me falta para cerrar el resto

1. Horario y mapa de Malasia (si existen).
2. Cómo describir la seguridad de Malasia, si aplica.
3. Confirmar si "Negociar términos" debe abrir el mismo flujo de `cita` que
   usa Europa, o si el trato con constructoras lo lleva alguien distinto —
   si es alguien distinto, ese botón necesita su propio destino, no `cita`.
4. Las dos intenciones nuevas (`amenidades`, `promociones`) hay que crearlas
   en `/intents/new` antes de poder escribirles respuesta — dijiste que no
   hay problema en dar de alta las que hagan falta, así que las dejé
   propuestas tal cual.
