## Why

Los cinco cambios anteriores construyeron una máquina que funciona y que nadie puede usar.

El árbol existe pero **no hay pantalla para dar de alta un desarrollo**: se siembran por SQL. Cada spec anterior dejó esa administración fuera, dando por hecho que otra la cubriría. El compilador terminó pidiendo elegir un desarrollo que no se puede crear desde ninguna parte.

Y lo que sí tiene pantalla, la muestra al revés. El panel del compilador pide seleccionar un **alcance**, ofrece un botón para **ejecutar la siguiente etapa** y presenta una sección de **hechos y procedencia**. Son los nombres de nuestras tablas y de nuestro pipeline. El usuario no tiene por qué saber que existe un árbol, ni que la compilación va por etapas porque un brochure no cabe en una petición.

Falta además la tercera entrada del compilador. Recibe el material y el preset del giro, pero la configuración de marca —cómo suena el bot, qué palabra usa el cliente para sus proyectos— no la produce nadie. Un brochure está escrito en prosa publicitaria; el bot habla en frases de dos líneas.

Dar de alta un cliente hoy significa escribir SQL a mano y después operar un pipeline desde una pantalla que describe su propia implementación.

## What Changes

- Un chat guiado lleva al cliente desde cero hasta un bot que responde: da de alta su proyecto, recoge cómo lo llama, toma su material y elige el tono.
- El vocabulario lo pone el cliente. La interfaz usa su palabra —desarrollo, fraccionamiento, plaza— en todas partes.
- Ninguna pregunta expone la estructura del sistema. La profundidad del catálogo se decide preguntando por cómo vende, no por cómo se modelan los datos.
- El tono se elige **viendo mensajes de ejemplo** con sus propios datos, no describiéndolo en un campo de texto.
- La compilación arranca sola al entregar el material y avanza sin que nadie la pilote.
- El panel del compilador se reduce a lo que sí es del usuario: revisar lo propuesto, ver de dónde salió cada dato, aprobar, y ver qué falta.

**Fuera de alcance de este cambio:**

- Objetivos de conversión distintos de la cita. Abstraerlos exige volver los flujos datos, y es un proyecto aparte.
- Cambiar cómo compila el compilador. Solo cambia quién lo dispara y qué se ve.
- Autoservicio de registro de clientes. El alta de la cuenta sigue siendo nuestra.
- Edición del árbol más allá de dar de alta un proyecto y sus partes.

Un cliente ya configurado no ve ningún cambio en el comportamiento de su bot.

## Capabilities

### New Capabilities

- `onboarding-chat`: recorrido guiado que da de alta un proyecto, recoge el vocabulario y la marca del cliente, recibe su material y dispara la compilación, sin exponer el modelo del sistema.

### Modified Capabilities

- `document-compiler`: la compilación deja de operarse a mano y avanza sola; el panel se reduce a la revisión y usa el vocabulario del cliente.

## Impact

**Base de datos**

- Migraciones nuevas a partir de la 037, aditivas.
- Vocabulario del cliente para nombrar sus proyectos.
- Configuración de marca que consume el compilador al redactar.
- Estado del recorrido, para poder retomarlo.

**Código afectado**

- `src/app/(dashboard)/compiler/page.tsx`: hoy expone el pipeline; se reduce a la revisión.
- `src/app/api/compiler/`: la ejecución por etapas deja de dispararse desde la interfaz.
- `src/core/document-compiler/`: la redacción pasa a recibir la configuración de marca.
- `src/data/repositories/scope.repository.ts`: ya sabe crear y reparentar; faltaba quién lo llame.
- `src/components/layout/sidebar.tsx`: el recorrido necesita entrada propia.

**Sin impacto**

- El matcher, el ruteo por alcance y el progreso del lead.
- El envío a WhatsApp.
- El contenido ya aprobado.
