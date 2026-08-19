# Candidatos a archivar

Lista viva, para decidir **al final**, cuando el bot a mano esté funcionando y
sepamos qué se usa de verdad. Nada de esto se toca todavía.

Regla para leerla: *archivar* no es borrar. Es sacar del camino crítico —del
menú, de las rutas, del build— lo que no se usa, dejando el código en el
repositorio por si el día que haya varios clientes vuelve a hacer falta.

## El compilador de documentos

Es la pieza grande. Existe para no teclear los datos de un cliente, y hoy hay
un cliente con dos fraccionamientos: teclearlos son veinte minutos.

| Qué | Dónde |
|---|---|
| Servicio del compilador | `src/core/document-compiler/` |
| Pantalla de contenido y aprobación | `src/app/(dashboard)/compiler/` |
| Rutas del compilador | `src/app/api/compiler/` |
| Repositorio | `src/data/repositories/document-compiler.repository.ts` |
| Onboarding guiado | `src/app/(dashboard)/onboarding/`, `src/core/onboarding/` |
| Tablas | `compiler_runs`, `compiler_materials`, `compiler_facts`, `compiler_coverage`, `compiler_proposals`, `onboarding_sessions` |

**Cuándo vuelve a servir:** cuando lleguen varios clientes con material propio.
Entonces la parte que hay que arreglar primero está diagnosticada: un objetivo
en la raíz no puede usar hechos de las ramas, y la comprobación de vocabulario
se bloquea con variantes que el propio prompt prohíbe generar.

**Ojo antes de tocarlo:** el catálogo y las respuestas publicadas apuntan a
`compiler_facts` y `compiler_materials` por clave foránea (`source_fact_id`,
`source_material_id`, `response_fact_dependencies`). Retirar esas tablas
obliga a decidir qué pasa con la procedencia de lo ya publicado.

## Lo que depende del compilador y caería con él

- **Reglas de bloqueo y revisión de propuestas** — `compiler-rules.ts`, las seis
  señales, `is_publishable`. Solo tienen sentido vigilando a un modelo que
  escribe a ciegas.
- **Vocabulario generado por modelo** — `VOCABULARY_GENERATION_VERSION` y todo
  el ciclo de regeneración. A mano, el vocabulario se escribe y se prueba con
  el probador de frases.
- **`ai_business_context`, `ai_extraction_model`, `ai_writing_model`** en
  Ajustes → Inteligencia Artificial: si no hay compilador, no hay a qué
  aplicarlos. La clave de OpenAI en Vault deja de hacer falta.

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
