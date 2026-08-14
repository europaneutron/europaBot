## Context

El esquema actual tiene 24 migraciones y asume un solo proyecto en todas partes. `intent_configurations.intent_name` es `UNIQUE` global y `bot_responses.intent_name` es una clave foránea contra esa columna. `resources` cuelga de `intent_category`. `agent_config` y `appointment_config` son singleton.

El bot está en producción y opera con normalidad, así que las 24 migraciones están aplicadas allá y los grants existen. Producción no puede quedar en un estado donde el esquema y el código desplegado se contradigan, ni requerir intervención manual para aceptar el cambio.

La decisión de fondo ya está tomada: un solo árbol auto-referenciado en lugar de dos mecanismos separados para proyectos y variantes. El árbol se usará plano —un nivel bajo la raíz— porque la profundidad la dicta el evento de conversión, que hoy es una cita por desarrollo. La estructura admite más niveles sin migrar cuando eso cambie.

## Goals / Non-Goals

**Goals:**

- Que el contenido y la configuración del bot puedan variar por desarrollo, definiendo una sola vez lo que es común.
- Que el cambio sea aditivo y producción lo acepte sin pasos manuales.
- Que con un solo alcance el comportamiento observable sea idéntico al actual.
- Dejar preparada la herencia de configuración para que sumar asesores u horarios por desarrollo no requiera otra migración.

**Non-Goals:**

- Interfaz de administración del árbol. Los nodos se siembran por SQL para probar.
- Determinar el alcance a partir del mensaje o del anuncio, y mantener el foco de la conversación.
- Checkpoints, lead score, citas y seguimientos por alcance.
- Usar más de un nivel de profundidad. La estructura lo permite; el contenido no lo usa todavía.

## Decisions

### Un árbol auto-referenciado, no dos mecanismos

Una sola tabla con referencia a sí misma cubre tanto la separación entre desarrollos como cualquier variante interna futura. La alternativa considerada —una entidad de proyecto para el ruteo y otra de variante para parametrizar respuestas— exige dos algoritmos de resolución que hacen lo mismo a distinta altura, y obliga a clasificar cada dato en una de las dos categorías. El árbol reemplaza esa clasificación por una pregunta más simple: a qué altura deja de ser cierto para todos.

La resolución ascendente hace falta de todos modos para separar lo global de lo específico. Generalizarla a N niveles cuesta un bucle en lugar de un caso especial.

### La resolución vive en un solo lugar

El recorrido ascendente debe implementarse una vez y usarse para contenido, recursos y configuración. Duplicarlo por tipo de dato es lo que permite que las reglas diverjan con el tiempo. La forma concreta —función en base de datos, consulta recursiva o resolución en la capa de repositorios— queda a criterio de la implementación, con dos condiciones: que sea única y que su costo no crezca con cada mensaje.

Conviene medir antes de optar por resolver en base de datos: la carga de intenciones ya usa caché en memoria con expiración, y el mismo enfoque puede cubrir el árbol, que cambia con muy poca frecuencia.

### La migración de la referencia de `bot_responses` va en dos etapas

Es el punto de mayor riesgo. `bot_responses.intent_name` apunta a una columna que deja de ser única, así que la clave foránea deja de ser válida.

La migración **no** debe hacer el cambio de golpe. Primero se agrega el identificador nuevo, se rellena a partir del nombre y se deja convivir con la columna anterior; el código pasa a leer y escribir por el identificador; y solo en una migración posterior, después de desplegar, se retira la columna vieja. Así, en cualquier instante, el código desplegado y el esquema son compatibles: si hay que revertir el despliegue, la columna anterior sigue ahí.

*Alternativa descartada:* sustituir la columna en una sola migración. Deja una ventana en la que el código anterior no puede leer las respuestas, y no permite revertir sin restaurar datos.

### El alcance nulo significa global

Una intención sin alcance está disponible desde cualquier nodo. Es preferible a crear un nodo raíz especial y obligar a que todo cuelgue de él, porque distingue explícitamente lo que es común a todos los tenants (saludo, derivación a asesor) de lo que pertenece a un desarrollo concreto.

La resolución busca primero en el alcance activo, luego en sus ancestros y por último en lo global, de modo que un desarrollo pueda sustituir un mensaje global sin borrarlo para los demás.

### El contenido existente se adopta bajo una raíz sembrada

La propia migración crea un alcance raíz y asocia a él las intenciones, respuestas y recursos actuales. Producción queda funcionando igual sin que nadie tenga que ejecutar nada, y la secuencia completa de migraciones sigue corriendo desde cero en un entorno nuevo.

## Risks / Trade-offs

- **La clave foránea de `bot_responses` es el punto más frágil del cambio** → Migración en dos etapas con convivencia de ambas columnas, y verificación de que las respuestas existentes se siguen resolviendo igual antes de retirar la anterior.

- **Producción puede tener cambios hechos a mano que no estén en las migraciones** → No está verificado que el esquema remoto coincida exactamente con la secuencia local. Antes de aplicar en producción hay que compararlos en modo lectura; el proyecto está desvinculado a propósito, así que re-vincular es un paso explícito y consciente.

- **La resolución ascendente se ejecuta en el camino del mensaje** → El bot responde con matcher y baja latencia; una resolución que consulte la base por cada mensaje la degradaría. Cachear el árbol en memoria, como ya se hace con las intenciones, y medirlo.

- **Un árbol invita a anidar de más** → El contenido se mantiene en un nivel bajo la raíz. La etiqueta que describe el tipo de nodo es informativa: el código no debe depender de cuántos niveles hay ni de cómo se llamen.

- **Ya existe una intención llamada `modelo`** → Al hablar de nodos y de tipos conviene evitar ese término en el esquema para no confundir la intención con la estructura.

- **La detección de intención acota su conjunto de candidatos** → Es una reducción, no una ampliación: con un solo alcance el conjunto es el mismo de hoy. Debe verificarse con la línea base existente de comportamiento del bot.

## Migration Plan

1. Migración aditiva que crea el árbol de alcances, siembra la raíz y asocia el contenido existente.
2. Migración aditiva que agrega el identificador nuevo en `bot_responses`, lo rellena y lo deja conviviendo con la columna anterior.
3. Cambio de código para leer y escribir por el identificador nuevo y resolver por herencia.
4. Despliegue y verificación con contenido real.
5. Migración posterior, fuera de este cambio, que retira la columna anterior.

**Rollback:** hasta el paso 4 inclusive, revertir el código es suficiente, porque la columna anterior sigue presente y poblada. No hay datos que restaurar.

**Verificación previa a producción:** comparar el esquema remoto con la secuencia local en modo lectura antes de aplicar nada.

## Open Questions

- ¿Dónde vive la resolución ascendente: en base de datos o en la capa de repositorios con caché en memoria? Decidir midiendo, con el criterio de no agregar consultas por mensaje.
- ¿Qué valores de configuración se acotan por alcance en esta entrega y cuáles siguen siendo globales? El criterio propuesto es acotar solo los que un segundo desarrollo necesitaría distintos de inmediato, y dejar el resto para cuando haga falta.
