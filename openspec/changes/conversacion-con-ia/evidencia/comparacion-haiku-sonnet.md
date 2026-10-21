# Comparación de modelos del contestador

Mismo conjunto (1 y 3) en ambos modelos. Para el modelo con más corridas se usan todas; las medianas no cambian por eso.

| Modelo | Turnos | Por IA | Costo/turno (contestador) | Costo/turno (con clasificador) | Espera mediana | Latencia por llamada, mediana | Respaldos | Fallan expectativa | Alertas de cifras o datos |
|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 64 | 100% | $0.00016 | $0.00024 | 1.8s | 1.5s | 0 | 1 | 6 |
| claude-sonnet-5-5 | 32 | 100% | $0.00285 | $0.00293 | 2.1s | 2.0s | 0 | 1 | 2 |

## Conversación objetivo, turno a turno (primera corrida de cada modelo)

### Hola

**claude-haiku-5-5**

> ¡Hola! 😊 Soy el asistente de Inmobiliaria Fymsa. Te ayudo con información de nuestros desarrollos Altabrisa y Europa.
> 
> ¿Qué tipo de vivienda estás buscando, y en cuál de los dos desarrollos te interesa?

**claude-sonnet-5-5**

> ¡Hola! 👋 Soy el asistente de Inmobiliaria Fymsa. Te puedo ayudar con información de nuestros desarrollos Altabrisa y Europa: precios, modelos y ubicación.
> 
> ¿Qué tipo de vivienda buscas, casa o terreno?

### ¿Cuánto cuestan?

**claude-haiku-5-5**

> En Altabrisa las casas van desde $1,420,000 (Modelo Cala, 2 recámaras) y el Modelo Mare desde $1,780,000 (3 recámaras).
> 
> En Europa las casas van desde $1,850,000 (Modelo Aura, 3 recámaras y 2 baños). También hay terrenos desde $780,000 de 160 m2.
> 
> ¿Cuál de los dos desarrollos te interesa y qué tipo de vivienda buscas?

**claude-sonnet-5-5**

> Depende del desarrollo 😊
> 
> - *Altabrisa*: casas desde $1,420,000.
> - *Europa*: casas desde $1,850,000 y terrenos desde $780,000 (160 m²).
> 
> ¿Buscas casa o terreno? Así te doy más detalle de los modelos.

### Europa

**claude-haiku-5-5**

> Perfecto, Europa. 🏡 Tenemos tres modelos de casa y terrenos:
> 
> - *Modelo Aura:* desde $1,850,000, 3 recámaras y 2 baños.
> - *Modelo Vento:* desde $2,340,000, 3 recámaras y 3 baños.
> - *Modelo Solara:* desde $2,980,000, 4 recámaras y 4 baños.
> - *Terrenos:* desde $780,000, de 160 m2.
> 
> Europa cuenta con caseta 24/7, alberca semiolimpica y casa club.
> 
> ¿Qué tipo de vivienda te interesa y tienes un presupuesto en mente?

**claude-sonnet-5-5**

> Perfecto, en Europa tenemos estas opciones 🏡
> 
> - *Aura*: 3 recámaras, 2 baños, desde $1,850,000.
> - *Vento*: 3 recámaras, 3 baños, desde $2,340,000.
> - *Solara*: 4 recámaras, 4 baños, desde $2,980,000.
> - *Terrenos*: 160 m², desde $780,000.
> 
> ¿Te interesa más una casa o un terreno?

### Solara

**claude-haiku-5-5** (alertas: oferta_de_visita_no_pedida)

> Buena elección, el Modelo Solara en Europa 🏡. Tiene 4 recámaras y 4 baños, con un precio desde $2,980,000.
> 
> ¿Te gustaría agendar una visita para conocerlo en persona? Si prefieres, también puedo ayudarte con más detalles.

**claude-sonnet-5-5** (alertas: oferta_de_visita_no_pedida)

> El modelo Solara es el más amplio de Europa 🏡
> 
> - 4 recámaras y 4 baños
> - Desde $2,980,000
> - Europa cuenta con caseta 24/7, alberca semiolímpica y casa club.
> 
> ¿Te gustaría conocerlo en persona? Puedo ayudarte a agendar una visita.

### ¿Dónde está?

**claude-haiku-5-5** (alertas: oferta_de_visita_no_pedida)

> Europa está en Avenida Ruiz Cortines 1820, Colonia Tamulte. 📍 Cuenta con caseta 24/7, alberca semiolimpica y casa club.
> 
> ¿Quieres que agendemos una visita al Modelo Solara para que lo conozcas en persona?

**claude-sonnet-5-5** (alertas: oferta_de_visita_no_pedida)

> Europa está en Avenida Ruiz Cortines 1820, Colonia Tamulte 📍
> 
> ¿Quieres que agendemos una visita para conocer el modelo Solara?

### ¿Qué amenidades tiene?

**claude-haiku-5-5** (alertas: oferta_de_visita_no_pedida)

> Europa cuenta con caseta 24/7, alberca semiolimpica y casa club. 🏊‍♂️
> 
> Si quieres más detalle de las amenidades o de cómo es el Modelo Solara por dentro, un asesor puede explicártelo con calma. ¿Te gustaría agendar una visita para conocerlo en persona?

**claude-sonnet-5-5** (alertas: oferta_de_visita_no_pedida)

> Europa cuenta con estas amenidades 🏊
> 
> - Caseta de seguridad 24/7
> - Alberca semiolímpica
> - Casa club
> 
> Si quieres conocer más detalles, un asesor te los puede dar. ¿Te paso con uno o prefieres agendar una visita para verlo en persona?

### ¿Y en Altabrisa cuánto cuesta?

**claude-haiku-5-5**

> En Altabrisa las casas van desde $1,420,000 con el Modelo Cala (2 recámaras). El Modelo Mare arranca en $1,780,000 y tiene 3 recámaras.
> 
> ¿Te interesa comparar Altabrisa con Europa para el Modelo Solara, o prefieres enfocarte en uno de los dos?

**claude-sonnet-5-5**

> En Altabrisa tenemos dos modelos de casa 🏡
> 
> - *Cala*: 2 recámaras, desde $1,420,000.
> - *Mare*: 3 recámaras, desde $1,780,000.
> 
> ¿Cuántas recámaras necesitas? Así te digo cuál te conviene más.

### precio de Cala

**claude-haiku-5-5** (alertas: oferta_de_visita_no_pedida)

> El Modelo Cala en Altabrisa cuesta desde $1,420,000, con 2 recámaras. 🏡
> 
> ¿Te interesa más el Cala o el Solara en Europa? Si me dices cuál te late, te digo qué sigue para visitarlo.

**claude-sonnet-5-5**

> El modelo Cala en Altabrisa cuesta desde $1,420,000 🏡 y tiene 2 recámaras.
> 
> ¿Es lo que buscas o prefieres una opción con más recámaras?

### ¿cuál es la más barata de Europa con 3 recámaras?

**claude-haiku-5-5**

> Con 3 recámaras en Europa, la más económica es el Modelo Aura: desde $1,850,000, con 2 baños. 🏡
> 
> La otra opción de 3 recámaras es el Modelo Vento, desde $2,340,000, con 3 baños.
> 
> ¿Tu presupuesto ronda por el Aura o estás viendo algo más amplio?

**claude-sonnet-5-5** (alertas: oferta_de_visita_no_pedida)

> La más económica de Europa con 3 recámaras es el modelo *Aura* 🏡
> 
> - 3 recámaras y 2 baños
> - Desde $1,850,000
> 
> El *Vento* también tiene 3 recámaras, pero va desde $2,340,000 y tiene 3 baños.
> 
> ¿Quieres que agendemos una visita para conocer el Aura?

### Quiero agendar

**claude-haiku-5-5**

> ¡Perfecto! 🏡 ¿Para cuál desarrollo quieres la visita, Altabrisa o Europa?

**claude-sonnet-5-5** (alertas: falta:europa)

> ¡Perfecto! Vamos a agendar tu visita. 📅
> 
> ¿Qué día te gustaría visitarnos? Por favor indica una fecha (ejemplo: mañana, viernes, 15 de noviembre)

## Conclusiones (tarea 11.4)

Conjunto: conversación objetivo, escenas complementarias y casos de riesgo sobre el fixture FYMSA y el contenido real (conjuntos 1 y 3). Haiku: 64 turnos en dos corridas; Sonnet: 32 turnos en una. Costos con los precios acordados (Haiku $0.10 / $0.50, Sonnet $2 / $10 por millón; lecturas de caché al 10%, escrituras al 125%).

| Medida | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| Costo por turno, contestador | $0.00016 | $0.00285 (unas 18 veces más) |
| Costo por turno, con clasificador (que sigue en Haiku) | $0.00024 | $0.00293 (unas 12 veces más) |
| Costo por 1,000 turnos | $0.24 | $2.93 |
| Espera mediana del lead | 1.8 s | 2.1 s |
| Latencia por llamada, mediana | 1.5 s | 2.0 s |
| Espera máxima | 6.1 s (turno con reintento de la guarda) | 5.3 s |
| Respaldos por falla del contestador | 0 | 0 |
| Cifras fuera del catálogo en la respuesta final | 0 | 0 |
| Inyección seguida, persona rota, código entregado | 0 | 0 |
| Oferta de visita no pedida por la nota del turno (conjuntos 1 y 3) | 28% de los turnos (18 de 64) | 25% de los turnos (8 de 32) |

Calidad, por lo que se leyó en las transcripciones:
- Los dos contestan igual de bien los datos del catálogo, los cruces entre modelos y las preguntas sin dato. No hay una diferencia de exactitud que justifique pagar la diferencia.
- Sonnet escribe respuestas con menos relleno y llama la tool de agenda con el desarrollo correcto en el último turno de la conversación objetivo; Haiku, en sus dos corridas, vuelve a preguntar el desarrollo. Es una diferencia de criterio a favor de Sonnet, de bajo impacto.
- Cuando la guarda de dinero rechaza una cifra derivada, Sonnet se disculpa con el lead ("Perdón por eso") y repite la tabla en vez de contestar; Haiku reescribe sin mostrar el reintento.
- Ninguno corrige por sí mismo la oferta de visita fuera de turno: es un problema del prompt, no del modelo.

Recomendación: quedarse con Haiku 5.5 como contestador. El costo por turno es una fracción de centavo contra unos tres décimos de centavo, la latencia es menor y la calidad medida no mejora con Sonnet. Los problemas encontrados (la guarda que rechaza las cifras que el propio lead escribe y las diferencias derivadas, y la oferta de visita fuera de turno) no los resuelve cambiar de modelo. Sonnet queda como alternativa de `ai_responder_model` si la persona o los casos de venta se vuelven más delicados; el cambio no requiere desplegar.

Limitaciones: una corrida de Sonnet, sin el conjunto 2 (frases reales con una sola oferta de contenido real); los respaldos por `invalid_money` de Haiku salieron en ese conjunto y no se midieron en Sonnet.
