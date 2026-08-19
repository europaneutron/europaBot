-- Un dato del material puede ser una lista: seis amenidades, cuatro creditos
-- aceptados, tres servicios incluidos. El publicador se quedaba con uno solo
-- --`DISTINCT ON (scope_id, fact_key)`-- porque la tabla admite una fila por
-- alcance y clave. Resultado en FYMSA: el catalogo guardaba "Caseta de
-- vigilancia 24/7" y la respuesta, que enlazaba `{amenidad}` seis veces,
-- repetia esa misma caseta seis veces.
--
-- La fila sigue siendo una por alcance y clave; lo que cambia es que su valor
-- puede ser un arreglo. Asi la edicion, la herencia y la unicidad siguen
-- funcionando igual, y quien renderiza decide como se lee una lista.

CREATE OR REPLACE FUNCTION public.publish_compiler_catalog_values()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'completed'
    OR OLD.status = 'completed'
    OR NEW.current_stage <> 'completed' THEN
    RETURN NEW;
  END IF;

  CREATE TEMP TABLE grouped_catalog_values ON COMMIT DROP AS
  WITH unique_facts AS (
    -- El mismo valor puede venir de dos materiales; en una lista se cuenta una
    -- vez. Se conserva el de mayor confianza como portador de la procedencia.
    SELECT DISTINCT ON (fact.scope_id, fact.fact_key, fact.fact_value)
      fact.scope_id,
      fact.fact_key,
      fact.fact_value,
      fact.fact_type,
      fact.unit,
      fact.id,
      fact.material_id,
      fact.page_number,
      fact.provenance_confidence,
      fact.created_at
    FROM public.compiler_facts AS fact
    WHERE fact.run_id = NEW.id
      AND NOT fact.is_contradictory
    ORDER BY fact.scope_id, fact.fact_key, fact.fact_value,
             fact.provenance_confidence DESC, fact.created_at
  ),
  ordered AS (
    SELECT
      unique_facts.*,
      ROW_NUMBER() OVER (
        PARTITION BY unique_facts.scope_id, unique_facts.fact_key
        ORDER BY unique_facts.provenance_confidence DESC, unique_facts.created_at
      ) AS position,
      COUNT(*) OVER (
        PARTITION BY unique_facts.scope_id, unique_facts.fact_key
      ) AS total
    FROM unique_facts
  )
  SELECT
    ordered.scope_id,
    ordered.fact_key AS value_key,
    CASE WHEN MAX(ordered.total) > 1
      THEN jsonb_agg(ordered.fact_value ORDER BY ordered.position)
      ELSE (array_agg(ordered.fact_value ORDER BY ordered.position))[1]
    END AS value,
    (array_agg(ordered.fact_type ORDER BY ordered.position))[1] AS value_type,
    (array_agg(ordered.unit ORDER BY ordered.position))[1] AS unit,
    (array_agg(ordered.id ORDER BY ordered.position))[1] AS source_fact_id,
    (array_agg(ordered.material_id ORDER BY ordered.position))[1] AS source_material_id,
    (array_agg(ordered.page_number ORDER BY ordered.position))[1] AS source_page_number
  FROM ordered
  GROUP BY ordered.scope_id, ordered.fact_key;

  IF NEW.replacement_mode = 'replace' THEN
    INSERT INTO public.catalog_values (
      scope_id, value_key, value, value_type, unit,
      source_fact_id, source_material_id, source_page_number,
      edited_by_human, edited_by, edited_at
    )
    SELECT
      scope_id, value_key, value, value_type, unit,
      source_fact_id, source_material_id, source_page_number,
      false, NULL, NULL
    FROM grouped_catalog_values
    ON CONFLICT (scope_id, value_key) DO UPDATE
      SET value = EXCLUDED.value,
          value_type = EXCLUDED.value_type,
          unit = EXCLUDED.unit,
          source_fact_id = EXCLUDED.source_fact_id,
          source_material_id = EXCLUDED.source_material_id,
          source_page_number = EXCLUDED.source_page_number,
          edited_by_human = false,
          edited_by = NULL,
          edited_at = NULL,
          updated_at = NOW();
  ELSE
    INSERT INTO public.catalog_values (
      scope_id, value_key, value, value_type, unit,
      source_fact_id, source_material_id, source_page_number
    )
    SELECT
      scope_id, value_key, value, value_type, unit,
      source_fact_id, source_material_id, source_page_number
    FROM grouped_catalog_values
    ON CONFLICT (scope_id, value_key) DO NOTHING;
  END IF;

  DROP TABLE grouped_catalog_values;
  RETURN NEW;
END;
$$;
