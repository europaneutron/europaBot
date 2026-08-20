-- ============================================
-- MIGRACIÓN: retira el compilador de documentos y el onboarding guiado
-- Fecha: 2026-08-20
-- Objetivo: el compilador "nunca funcionó" (decisión de Leonardo,
-- 2026-08-20) y no se va a seguir construyendo sobre él. Esta migración
-- retira su esquema por completo -- tablas, funciones, columnas de
-- procedencia -- sin tocar una sola tabla de las que sí se usan.
--
-- Es aditiva en el sentido que importa aquí: no reescribe ninguna de las 70
-- migraciones anteriores, que se quedan como historia. Solo agrega este
-- paso, hacia adelante, que retira lo que ya no tiene lector.
--
-- Se leyó cada migración que toca una tabla de compilador u onboarding,
-- sentencia por sentencia, no por su nombre de archivo. Media docena
-- mezclaban una tabla que sí se usa con una función que no:
--
--   - `client_brand_config` (Ajustes → El negocio) y `bump_scope_tree_version()`
--     (la caché del árbol, en cada mensaje) nacieron en migraciones de
--     onboarding/compilador. Se quedan intactos.
--   - `catalog_values` (el catálogo) y `bot_responses.edited_by_human /
--     deactivated_at` (el archivado) igual. Solo se sueltan sus tres
--     columnas de procedencia hacia el compilador.
--
-- Lo que SÍ se retira, confirmado sin lectores fuera del compilador:
--   Tablas:    compiler_runs, compiler_materials, compiler_facts,
--              compiler_proposals, compiler_proposal_facts, compiler_coverage,
--              response_fact_dependencies (junction, cero lectores propios:
--                solo alimentaba el enlace de procedencia en el panel, que
--                también se retiró), response_replacements (cero lectores en
--                todo el código, ni siquiera del compilador: solo se escribía),
--              onboarding_sessions.
--   Columnas:  catalog_values.source_fact_id / source_material_id /
--              source_page_number (procedencia hacia un material que ya no
--              existe).
--   Funciones: publish_compiler_run, approve_compiler_proposal,
--              replace_scoped_compiler_proposals, install_base_conversation_kit,
--              publish_compiler_catalog_values.
--
-- `bump_scope_tree_version()` NO se toca: sus cuatro disparadores viven en
-- scopes, intent_configurations, bot_responses y catalog_values -- las
-- cuatro tablas núcleo -- y sin ella el árbol dejaría de invalidar su caché.
-- ============================================

-- 1. Las tres columnas de procedencia en el catálogo. Antes de tocar las
--    tablas de origen: son la única referencia externa hacia ellas.
ALTER TABLE public.catalog_values
  DROP COLUMN IF EXISTS source_fact_id,
  DROP COLUMN IF EXISTS source_material_id,
  DROP COLUMN IF EXISTS source_page_number;

-- 2. Las funciones. DROP FUNCTION no desaparece solo al borrar la tabla que
--    usan sus disparadores -- son objetos aparte -- así que se listan aquí.
DROP FUNCTION IF EXISTS public.publish_compiler_run(uuid, uuid);
DROP FUNCTION IF EXISTS public.approve_compiler_proposal(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.approve_compiler_proposal(uuid, uuid, jsonb, boolean);
DROP FUNCTION IF EXISTS public.replace_scoped_compiler_proposals(uuid, jsonb);
DROP FUNCTION IF EXISTS public.install_base_conversation_kit(uuid);
DROP FUNCTION IF EXISTS public.publish_compiler_catalog_values() CASCADE;

-- 3. Las tablas, con CASCADE: se lleva detrás sus disparadores, índices,
--    políticas de RLS y los FK que ya no importan (incluido
--    bot_responses.compiler_proposal_id, que se queda como columna huérfana
--    -- se conserva por si prod tiene contenido histórico marcado 'compiler'
--    que valga la pena poder distinguir, y no bloquea nada al quedarse sin
--    su referencia).
DROP TABLE IF EXISTS public.response_fact_dependencies CASCADE;
DROP TABLE IF EXISTS public.compiler_proposal_facts CASCADE;
DROP TABLE IF EXISTS public.response_replacements CASCADE;
DROP TABLE IF EXISTS public.compiler_proposals CASCADE;
DROP TABLE IF EXISTS public.compiler_facts CASCADE;
DROP TABLE IF EXISTS public.compiler_materials CASCADE;
DROP TABLE IF EXISTS public.compiler_coverage CASCADE;
DROP TABLE IF EXISTS public.compiler_runs CASCADE;
DROP TABLE IF EXISTS public.onboarding_sessions CASCADE;
