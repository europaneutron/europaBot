# AGENTS.md
### Guía de desarrollo — EuropaBot

---

## 1. Qué es este proyecto

Bot de WhatsApp para venta inmobiliaria. Recibe mensajes por webhook de la WhatsApp
Business Cloud API (Meta) y responde con el contenido configurado desde un dashboard
administrativo, por uno de dos caminos:

- **Conversación con IA** (Claude Haiku 5.5), cuando el interruptor `ai_enabled` de
  `bot_config` está encendido. Ver la sección 12.
- **Bot léxico**: un matcher determinista que detecta la intención y manda la respuesta
  configurada. Es el camino cuando la IA está apagada, el respaldo cuando la IA falla, y
  el que atiende los flujos en curso (cita, formulario, captura del nombre para el asesor).

Hasta octubre de 2026 el bot no usaba un LLM en tiempo de conversación. La decisión se
revisó en `openspec/changes/conversacion-con-ia/proposal.md`: el árbol de respuestas con
botones hacía que los leads se quedaran en el primer paso.

**Stack real:**

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui sobre Radix |
| Datos cliente | SWR |
| Backend | Supabase (Postgres, Auth, Storage, Vault) |
| Mensajería | WhatsApp Business Cloud API (Meta), HTTP directo |
| IA conversacional | Claude (Anthropic), `@anthropic-ai/sdk` |
| Validación | zod |
| Hosting | Vercel (incluye cron jobs) |

---

## 2. Principios

- Preferir claridad, estabilidad y mantenibilidad sobre complejidad técnica.
- Construir solo lo necesario. Evitar sobreingeniería y abstracciones especulativas.
- Una responsabilidad por función, componente o módulo (SRP).
- Aplicar DRY: extraer patrones repetidos a servicios o utilidades.
- Documentar el *por qué* de las decisiones, no el *qué hace* cada línea.
- Ante ambigüedad, investigar el flujo de datos y las dependencias antes de escribir código.
- Confirmar con el responsable técnico antes de cambios estructurales.
- Trabajo incremental, verificable y reversible.

---

## 3. Estructura del código

```
src/
  app/
    (auth)/          Login y recuperación
    (dashboard)/     Panel administrativo (protegido por middleware)
    api/             Route handlers
    test/            Páginas de prueba manual
  components/
    ui/              Primitivas shadcn/ui — no editar sin motivo
    admin/           Componentes del panel (MediaLibrary, etc.)
    intents/         Formularios de intents
    layout/          Navegación y estructura
  core/              Lógica de negocio, sin dependencias de UI
    ai-conversation/ Camino con IA: contexto, contestador, clasificador y guardas
    intent-engine/   Matcher léxico y servicio de detección
    conversation/    Orquestador de mensajes
    appointment/     Flujo de agendamiento
    followup/        Seguimientos programados
    fallback/        Escalamiento y derivación a asesor
    scoring/         Cálculo de lead score
  data/
    models/          Tipos de dominio
    repositories/    Único punto de acceso a Supabase
  services/
    whatsapp/        Envío de mensajes y validación de webhook
    anthropic/       Cliente de Claude configurado desde bot_config
    supabase/        Clientes (server, browser, admin)
    storage/         Subida de archivos
  hooks/             Hooks de React para el dashboard
  lib/               Configuración, constantes y utilidades
  types/             Tipos compartidos
```

**Reglas de capa:**

- `core/` no importa de `app/` ni de `components/`.
- El acceso a base de datos vive **solo** en `data/repositories/`. Ningún componente ni
  route handler consulta Supabase directamente.
- Los route handlers orquestan; no contienen lógica de negocio.

---

## 4. Nomenclatura

- `camelCase` en código TypeScript.
- `snake_case` en base de datos y en los campos de payloads de la API de Meta.
- Archivos: `kebab-case.ts`. Componentes React: `PascalCase.tsx`.
- Repositorios: `<entidad>.repository.ts`. Variante cliente: `<entidad>.repository.client.ts`.
- Nombres descriptivos. Evitar abreviaturas que no sean del dominio.

---

## 5. Base de datos y migraciones

- Las migraciones viven en `supabase/migrations/NNN_nombre.sql`, numeradas y secuenciales.
- **Nunca editar una migración ya aplicada.** Los cambios van en una migración nueva.
- Toda migración debe poder correr desde cero: la secuencia completa `001 → N` es la
  fuente de verdad del esquema.
- Documentar en comentarios el objetivo de la migración y su impacto.
- Habilitar RLS en tablas nuevas y definir políticas explícitas para `service_role`
  (backend) y `authenticated` (dashboard).
- Verificar dependencias antes de cambiar estructuras existentes: FKs, constraints,
  índices, vistas y consultas en `data/repositories/`.

---

## 6. Configuración del asesor: una sola fuente

`advisor_phone`, `business_hours` y `advisor_email` viven en `bot_config`, acotada por
`scope_id` (migración `20260819050000`). Una fila con `scope_id` nulo es global —la que edita
el administrador en Ajustes—; una fila con `scope_id` propio la sobrescribe para ese alcance y
sus descendientes, con la misma herencia que el resto del contenido.

`configRepository.getManyByScope(keys, scopeId)` resuelve esas tres claves por alcance.
`appointmentRepository.getDefaultAgent(scopeId)` es quien la llama; nada más debe leer estas
tres claves directamente. `agent_config` ya no las declara (migración `20260819060000`): solo
guarda lo que no se unificó —el teléfono y nombre del agente asignado, la plantilla de
notificación—.

Sin teléfono en el alcance ni en sus ancestros, `getDefaultAgent` lanza en vez de usar un valor
por omisión: fue así como se detectó la duplicación anterior, con el teléfono de prueba
sembrado por la migración 007.

## 7. Pruebas

El proyecto no usa framework de pruebas. La convención son **scripts ejecutables con `tsx`**
en `scripts/`, nombrados `test-<área>.ts`:

```bash
npx tsx scripts/test-matcher.ts
```

Para probar el pipeline de conversación completo sin WhatsApp, existe el endpoint
`POST /api/test/process-message`, que ejecuta el procesador de mensajes y devuelve la
respuesta sin enviarla.

**`openspec/conversacion-objetivo.md` define qué tiene que poder conversar el bot**, y es
criterio de aceptación de las specs pendientes: se lee antes de escribir una y sus turnos
tienen que pasar antes de darla por terminada. `scripts/simulate-fymsa.ts` los ejecuta.

Todo script debe cargar primero `.env.development.local` y solo después `.env.local` como
respaldo. `dotenv` no sobreescribe variables ya definidas, así que el primero gana y el
script apunta al stack local. Un script que cargue únicamente `.env.local` se ejecuta contra
producción, y varios de ellos escriben datos.

```ts
config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });
```

Los scripts que escriben o borran datos deben además verificar que la URL de Supabase es
local antes de operar.

Todo cambio en `core/` debe traer su script de verificación.

Para el camino con IA, los tests verdes no bastan: en este proyecto ya hubo regresiones que
solo mostró una conversación completa. Ningún cambio al prompt, a las tools o a las guardas se
da por bueno sin correr:

```bash
npx tsx scripts/simulate-ai.ts --runs 2 --sets 1,2,3
npx tsx scripts/test-whatsapp-regressions.ts
```

El primero corre la conversación objetivo, conversaciones con frases reales de leads y casos de
riesgo; el segundo repite los hallazgos de la prueba por WhatsApp real. Las frases reales salen de
un respaldo local con `scripts/extract-real-phrases.ts` y nunca se suben al repositorio.

---

## 8. Antipatrones a evitar

- Consultar Supabase fuera de `data/repositories/`.
- Valores hardcodeados donde corresponde configuración (`bot_config`) o variable de entorno.
- `try/catch` vacíos o que silencian errores sin registrarlos.
- Funciones con múltiples responsabilidades.
- Duplicar lógica que ya resuelve la base de datos o un servicio existente.
- Copiar y pegar código sin abstraerlo.
- Introducir dependencias sin evaluar su costo de mantenimiento.
- Parches sin plan de mantenimiento.

---

## 9. Estilo

- **No agregar emojis** en código, comentarios, logs ni mensajes del sistema.
  El código existente contiene emojis en logs anteriores a esta regla: se dejan como están,
  pero no se introducen nuevos ni se replican al escribir código nuevo.
  Esto no aplica al contenido conversacional del bot, donde los emojis son parte del
  mensaje que ve el usuario final y se configuran desde el dashboard.
- Sin comentarios decorativos ni separadores puramente visuales en código nuevo.
- Mensajes de error claros, accionables y sin disculpas.

---

## 10. Entornos

- **Producción:** Vercel + proyecto Supabase remoto. No se modifica sin pruebas previas.
- **Local:** stack de Supabase por Docker (`supabase start`) y `.env.development.local`,
  que Next.js prioriza sobre `.env.local` en desarrollo. El entorno local nunca debe
  apuntar a credenciales de producción.
- Las variables requeridas están documentadas en `.env.example`.
- El webhook de Meta se configura a nivel de App, no de número: usar una App de Meta
  distinta para pruebas para no repuntar el webhook de producción.

### Grants faltantes en un stack local recién creado

Tras un `supabase start` sobre una base nueva, las tablas creadas por las migraciones pueden
quedar sin privilegios para los roles `anon`, `authenticated` y `service_role`. El síntoma es
`permission denied` en cualquier consulta, incluso desde el backend con la clave de servicio.

Es un problema de inicialización del entorno local, no de las políticas RLS: los grants
controlan el acceso a la tabla y las políticas controlan las filas visibles. Sin grants, RLS
ni siquiera llega a evaluarse.

Los grants viven en `supabase/seed.sql`, que el CLI ejecuta automáticamente después de las
migraciones en `supabase start` y `supabase db reset`. No hay paso manual.

`seed.sql` es local por definición: `supabase db push` sube únicamente las migraciones, así
que nada de ese archivo puede alcanzar producción.

No agregar estos grants como migración. Producción no los necesita —el bot opera ahí, luego
`service_role` ya tiene acceso— y una migración correría contra prod sin motivo.

Verificar que quedaron aplicados en local:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54922/postgres" \
  -c "SELECT grantee, count(*) FROM information_schema.role_table_grants \
      WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') \
      GROUP BY grantee;"
```

---

## 11. Control de cambios

- El trabajo de features se especifica con OpenSpec (`openspec/`) antes de implementarse.
- Una rama por cambio. Commits que describan qué se hizo y por qué.
- Mantener trazabilidad entre migraciones, specs y código.
- No modificar producción directamente.

---

## 12. Conversación con IA

El modelo interpreta y el código afirma. El modelo redacta la respuesta y decide cuándo llamar una
tool; todo lo que se puede validar o quitar en código no se le encarga al modelo.

**Dónde vive:** `src/core/ai-conversation/`. `ai-path.ts` decide por mensaje si contesta la IA o
el bot léxico; `context-builder.ts` arma el prompt; `responder.ts` llama al contestador;
`topic-classifier.ts` detecta los temas del score en una llamada aparte, en paralelo;
`guards/` valida la salida.

**El contexto sale del contenido que ya existe**, sin copiarlo: persona, capacidades, catálogo con
la ruta completa de cada dato ("Europa > Solara > precio") y las respuestas configuradas como
preguntas frecuentes. Las respuestas con huecos sin llenar, con marcadores de plantilla o marcadas
como navegación no entran. El estado de cada turno (fecha, cita vigente, nota de oferta) va como un
mensaje de sistema al final, para no romper la caché del prompt.

**Sin foco de conversación.** El árbol de alcances solo ordena el contenido y la herencia. El modelo
resuelve de qué se habla con el historial; donde el código necesita un desarrollo, lo recibe como
parámetro de una lista cerrada.

**Guardas en código, no en el prompt:**

- Toda cifra de dinero de la respuesta debe estar en el catálogo, en el texto de las respuestas,
  en lo que escribió el lead o ser la suma o resta de dos precios del catálogo.
- El formato se convierte a WhatsApp antes de enviar.
- Ante tiempo agotado, error del proveedor, rechazo, cifra inválida o respuesta vacía, contesta el
  bot léxico con el mismo mensaje.
- La cita la confirma el flujo de agendamiento, nunca el modelo; con una cita vigente no se abre
  un segundo flujo.

**Cómo se escribe el prompt.** Hechos, no prohibiciones. Una lista de "NUNCA" o "PROHIBIDO" provoca
justo lo que prohíbe; dictar una frase literal hace que se repita fuera de contexto; un ejemplo con
huecos o con datos reales se copia. Cada regla dice lo que sí ocurre y, si hace falta, por qué. Lo
mismo vale para la nota del turno: un dato escrito como alerta ("quedó reemplazado", "no hay otra
fecha pendiente") se repite en cada mensaje.

**Operación:**

- `ai_enabled` es encendido y apagado, sin lista de teléfonos. Apagarlo vale desde el siguiente
  mensaje.
- Cada llamada queda en `ai_model_calls` (tokens, latencia, tools, guardas, causa de respaldo) y
  cada clasificación en `ai_topic_classifications`, junto con lo que habría detectado el matcher.
- `ai_score_source` decide si el lead score sale del matcher o del clasificador. La calibración
  contra frases etiquetadas está en `openspec/changes/conversacion-con-ia/evidencia/`.
- La prueba por WhatsApp real se hace desde local: una App de Meta de prueba con su número, el
  webhook por un túnel hacia `next dev`, y el contenido de prod copiado con
  `scripts/pull-prod-content.sh`, que solo lee y no trae datos personales.
