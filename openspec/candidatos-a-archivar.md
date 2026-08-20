# Candidatos a archivar

Lista viva. El compilador y el onboarding ya no son candidatos: se eliminaron
el 2026-08-20 (decisión de Leonardo: "nunca funcionó"). Lo que sigue en esta
lista es lo demás, que todavía no se toca.

Regla para leerla: *archivar* no es borrar. Es sacar del camino crítico —del
menú, de las rutas, del build— lo que no se usa, dejando el código en el
repositorio por si el día que haya varios clientes vuelve a hacer falta.

## El compilador de documentos y el onboarding — eliminados, no archivados

No quedaron como candidatos: se retiraron por completo, código y esquema.

| Qué | Dónde vivía | Estado |
|---|---|---|
| Servicio del compilador | `src/core/document-compiler/` | Borrado |
| Pantalla de contenido y aprobación | `src/app/(dashboard)/compiler/` | Borrado |
| Rutas del compilador | `src/app/api/compiler/` | Borrado |
| Repositorio | `src/data/repositories/document-compiler.repository.ts` | Borrado |
| Onboarding guiado | `src/app/(dashboard)/onboarding/`, `src/core/onboarding/` | Borrado |
| Tablas | `compiler_runs`, `compiler_materials`, `compiler_facts`, `compiler_proposal_facts`, `compiler_coverage`, `compiler_proposals`, `onboarding_sessions`, `response_replacements`, `response_fact_dependencies` | Retiradas en `20260820120000_retire_compiler_and_onboarding.sql` |

**Lo que se rescató antes de borrar**, porque vivía en un archivo del
compilador/onboarding pero lo usa el runtime o el panel todos los días:

- `shortScopeAlias` (rótulo corto de un alcance) → `src/lib/scope-alias.ts`.
- `renderClientBrand`, `toClientVocabulary`, `normalizeScopeAlias` (vocabulario
  del negocio en los mensajes) → `src/core/messaging/client-brand.ts`.
- `ClientBrandConfig`, `BrandTone` → `src/data/models/client-brand.model.ts`.
- `client_brand_config` (la fila de Ajustes → El negocio) y
  `bump_scope_tree_version()` (la caché del árbol, con sus cuatro
  disparadores en `scopes`, `intent_configurations`, `bot_responses` y
  `catalog_values`) nacieron en migraciones de onboarding/compilador y se
  quedaron intactos: son núcleo, no del compilador.
- `catalog_values` y `bot_responses.edited_by_human / deactivated_at` igual.
  Solo se soltaron las tres columnas de procedencia hacia el compilador
  (`source_fact_id`, `source_material_id`, `source_page_number`) y el enlace
  al documento en el panel del catálogo.

**Lo que se retiró de la pantalla junto con ellos**, por quedarse sin
consumidor:

- El saludo automático: eran dos saludos que nadie pidió, y el compuesto
  además borraba la respuesta escrita para `saludo` sin decirlo. La columna
  `client_brand.use_composed_greeting` sigue en la tabla --las migraciones son
  aditivas-- y ya no la lee nadie.
- El badge de procedencia del documento en `/catalog` y el enlace de página
  en `/intents/q/<pregunta>` (apuntaban a `/api/compiler/materials`, que ya
  no existe).

**Sin tocar, y vale la pena revisarlo aparte:** `ai_extraction_model` y
`ai_writing_model` en Ajustes → Inteligencia Artificial se quedaron sin
ningún consumidor (solo los usaba el compilador), pero la pantalla y el
config key siguen ahí. No bloquean nada; es limpieza pendiente, no urgente.

## Los mensajes del sistema, después de la simplificación

De once quedan dos editables: `scope_disambiguation_message` y
`offer_appointment_label`. Los otros nueve se borraron de `bot_config` en la
migración `20260819120000`, y los momentos que seguían existiendo pasaron a
texto fijo en el código.

La razón no era ahorrar campos: el bot preguntaba "¿de cuál te platico?"
mirando una sola cosa --si dos desarrollos pueden contestar-- sin mirar nunca
si el nivel de la conversación ya tenía respuesta escrita. Con esa regla
puesta, seis de esos mensajes dejaron de tener momento en el que salir.

**Ojo con el kit base.** La migración 002 siembra `precio`, `ubicacion`,
`modelo`, `creditos`, `seguridad` y `brochure` en la raíz **con respuesta**, y
esos textos son de otro negocio ("departamentos en Europa desde $XXX,XXX").
Con la regla nueva, esas respuestas ya no se saltan: se mandan. Hay que
reescribirlas o retirarlas antes de que el bot vea tráfico.

## Deuda ya identificada, sin dueño

- **Retención.** 308 intenciones archivadas y 94 alcances retirados de las
  corridas de prueba. "Sustituir" no borra de verdad; conserva todo por si
  hace falta deshacer. Con el bot a mano deja de crecer, pero lo acumulado
  sigue ahí.
- **`answers.aliases` con dos significados** — los alias de un proyecto en el
  alta manual, los nombres de los hermanos cuando la estructura sale del
  material. Ya está documentado en el tipo y `project_names` lo reemplaza,
  pero la clave vieja sigue escribiéndose.
- **`awaiting_advisor_name`** se traga cualquier mensaje: quien escribe otra
  cosa mientras el flujo de cita espera el nombre, ve su mensaje convertido en
  nombre. Congelado a propósito.
- **Tres respuestas sembradas piden cita por su cuenta** y el bot no escucha
  ese "sí". Congelado a propósito.

## Lo que NO se archiva

Para que quede dicho, porque es la mitad del valor de lo construido:

- El árbol de alcances con herencia (`scopes`, `resolveRows`).
- El catálogo de datos y su pantalla.
- Las preguntas con su árbol por alcance, el editor de respuestas y el de
  vocabulario.
- Los botones y la lista interactiva, y el flujo de cita.
- El webhook, el simulador y el historial de conversaciones.
- El probador de frases.
