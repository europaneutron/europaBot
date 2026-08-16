-- Agrega el compilador offline de material comercial. El runtime no consulta
-- estas tablas: solo consume bot_responses aprobadas, igual que antes.

CREATE TYPE public.compiler_material_kind AS ENUM ('text', 'pdf', 'document');
CREATE TYPE public.compiler_reading_status AS ENUM ('pending', 'ready', 'unreadable', 'failed');
CREATE TYPE public.compiler_run_status AS ENUM ('pending', 'running', 'waiting_tree_approval', 'waiting_content_approval', 'completed', 'failed');
CREATE TYPE public.compiler_stage AS ENUM ('ingest', 'extract_facts', 'consolidate_facts', 'tree', 'catalog', 'content', 'review', 'completed');
CREATE TYPE public.compiler_approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.response_origin AS ENUM ('manual', 'compiler');

CREATE TABLE public.compiler_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  material_kind public.compiler_material_kind NOT NULL,
  original_filename TEXT NOT NULL,
  storage_path TEXT,
  mime_type TEXT NOT NULL,
  plain_text TEXT,
  extracted_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  reading_status public.compiler_reading_status NOT NULL DEFAULT 'pending',
  reading_error TEXT,
  checksum TEXT NOT NULL,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compiler_material_source_check CHECK (
    (material_kind = 'text' AND plain_text IS NOT NULL AND storage_path IS NULL)
    OR (material_kind <> 'text' AND storage_path IS NOT NULL)
  ),
  CONSTRAINT compiler_material_checksum_not_blank CHECK (length(btrim(checksum)) > 0)
);

CREATE TABLE public.compiler_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  material_ids UUID[] NOT NULL DEFAULT '{}',
  status public.compiler_run_status NOT NULL DEFAULT 'pending',
  current_stage public.compiler_stage NOT NULL DEFAULT 'ingest',
  stage_checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_tree JSONB NOT NULL DEFAULT '[]'::jsonb,
  tree_approved_at TIMESTAMPTZ,
  tree_approved_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  previous_run_id UUID REFERENCES public.compiler_runs(id) ON DELETE SET NULL,
  last_error TEXT,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT compiler_tree_gate_check CHECK (
    current_stage IN ('ingest', 'extract_facts', 'consolidate_facts', 'tree')
    OR tree_approved_at IS NOT NULL
  )
);

ALTER TABLE public.compiler_materials
  ADD COLUMN run_id UUID REFERENCES public.compiler_runs(id) ON DELETE SET NULL;

CREATE TABLE public.compiler_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.compiler_runs(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.compiler_materials(id) ON DELETE CASCADE,
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  fact_key TEXT NOT NULL,
  fact_value JSONB NOT NULL,
  fact_type TEXT NOT NULL DEFAULT 'text',
  page_number INTEGER NOT NULL,
  provenance_confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
  fingerprint TEXT NOT NULL,
  is_contradictory BOOLEAN NOT NULL DEFAULT false,
  supersedes_fact_id UUID REFERENCES public.compiler_facts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compiler_fact_key_not_blank CHECK (length(btrim(fact_key)) > 0),
  CONSTRAINT compiler_fact_page_positive CHECK (page_number > 0),
  CONSTRAINT compiler_fact_confidence_range CHECK (provenance_confidence BETWEEN 0 AND 1),
  CONSTRAINT compiler_fact_unique_provenance UNIQUE (run_id, material_id, page_number, fingerprint)
);

CREATE TABLE public.compiler_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.compiler_runs(id) ON DELETE CASCADE,
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  intent_name TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('covered', 'gap', 'rejected')),
  fact_ids UUID[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('preset', 'material', 'fallback')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compiler_coverage_unique_question UNIQUE (run_id, scope_id, intent_name, question)
);

CREATE TABLE public.compiler_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.compiler_runs(id) ON DELETE CASCADE,
  coverage_id UUID REFERENCES public.compiler_coverage(id) ON DELETE SET NULL,
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  intent_id UUID NOT NULL REFERENCES public.intent_configurations(id) ON DELETE CASCADE,
  response_key TEXT NOT NULL,
  message_text JSONB NOT NULL,
  matcher_patterns JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_status public.compiler_approval_status NOT NULL DEFAULT 'pending',
  review_signals TEXT[] NOT NULL DEFAULT '{}',
  approved_with_signals TEXT[] NOT NULL DEFAULT '{}',
  edited_by_human BOOLEAN NOT NULL DEFAULT false,
  approved_response_id UUID REFERENCES public.bot_responses(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compiler_proposal_unique_response UNIQUE (run_id, scope_id, intent_id, response_key),
  CONSTRAINT compiler_proposal_approval_consistent CHECK (
    (approval_status = 'pending' AND approved_at IS NULL AND rejected_at IS NULL)
    OR (approval_status = 'approved' AND approved_at IS NOT NULL AND rejected_at IS NULL)
    OR (approval_status = 'rejected' AND approved_at IS NULL AND rejected_at IS NOT NULL)
  )
);

CREATE TABLE public.compiler_proposal_facts (
  proposal_id UUID NOT NULL REFERENCES public.compiler_proposals(id) ON DELETE CASCADE,
  fact_id UUID NOT NULL REFERENCES public.compiler_facts(id) ON DELETE RESTRICT,
  PRIMARY KEY (proposal_id, fact_id)
);

ALTER TABLE public.bot_responses
  ADD COLUMN origin public.response_origin NOT NULL DEFAULT 'manual',
  ADD COLUMN compiler_proposal_id UUID REFERENCES public.compiler_proposals(id) ON DELETE SET NULL,
  ADD COLUMN review_signals TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE public.response_fact_dependencies (
  response_id UUID NOT NULL REFERENCES public.bot_responses(id) ON DELETE CASCADE,
  fact_id UUID NOT NULL REFERENCES public.compiler_facts(id) ON DELETE RESTRICT,
  PRIMARY KEY (response_id, fact_id)
);

COMMENT ON COLUMN public.bot_responses.origin IS
  'Origen auditable. Las filas anteriores a esta migracion quedan marcadas como manuales.';
COMMENT ON COLUMN public.compiler_materials.extracted_pages IS
  'Solo se usa para formatos sin entrada nativa. Cada elemento conserva su numero de pagina o seccion.';
COMMENT ON COLUMN public.compiler_facts.page_number IS
  'La procedencia termina en documento y pagina; un hecho sin pagina no puede guardarse.';

CREATE INDEX idx_compiler_materials_scope_created ON public.compiler_materials(scope_id, created_at DESC);
CREATE INDEX idx_compiler_runs_scope_created ON public.compiler_runs(scope_id, created_at DESC);
CREATE INDEX idx_compiler_runs_pending_stage ON public.compiler_runs(current_stage, updated_at) WHERE status IN ('pending', 'running');
CREATE INDEX idx_compiler_facts_run_scope ON public.compiler_facts(run_id, scope_id);
CREATE INDEX idx_compiler_facts_key ON public.compiler_facts(scope_id, fact_key);
CREATE INDEX idx_compiler_coverage_run_status ON public.compiler_coverage(run_id, status);
CREATE INDEX idx_compiler_proposals_run_status ON public.compiler_proposals(run_id, approval_status);
CREATE INDEX idx_response_fact_dependencies_fact ON public.response_fact_dependencies(fact_id);

CREATE FUNCTION public.approve_compiler_proposal(
  proposal_uuid UUID,
  admin_uuid UUID,
  approved_message JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  proposal public.compiler_proposals%ROWTYPE;
  intent public.intent_configurations%ROWTYPE;
  response_uuid UUID;
  final_message JSONB;
BEGIN
  SELECT * INTO proposal
  FROM public.compiler_proposals
  WHERE id = proposal_uuid
  FOR UPDATE;

  IF proposal.id IS NULL OR proposal.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'compiler proposal is missing or was already reviewed';
  END IF;

  SELECT * INTO intent
  FROM public.intent_configurations
  WHERE id = proposal.intent_id;

  final_message := COALESCE(approved_message, proposal.message_text);

  INSERT INTO public.bot_responses (
    intent_id, intent_name, response_key, message_text, response_type,
    variables, is_active, order_priority, origin, compiler_proposal_id
  ) VALUES (
    proposal.intent_id, intent.intent_name, proposal.response_key, final_message,
    'fragmented', '{}'::jsonb, true, 1, 'compiler', proposal.id
  )
  RETURNING id INTO response_uuid;

  INSERT INTO public.response_fact_dependencies (response_id, fact_id)
  SELECT response_uuid, fact_id
  FROM public.compiler_proposal_facts
  WHERE proposal_id = proposal.id;

  UPDATE public.intent_configurations
  SET keywords = ARRAY(
        SELECT DISTINCT value FROM unnest(
          COALESCE(keywords, '{}') ||
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(proposal.matcher_patterns->'keywords', '[]'::jsonb)))
        ) AS value
      ),
      synonyms = ARRAY(
        SELECT DISTINCT value FROM unnest(
          COALESCE(synonyms, '{}') ||
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(proposal.matcher_patterns->'synonyms', '[]'::jsonb)))
        ) AS value
      ),
      typos = ARRAY(
        SELECT DISTINCT value FROM unnest(
          COALESCE(typos, '{}') ||
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(proposal.matcher_patterns->'typos', '[]'::jsonb)))
        ) AS value
      ),
      phrases = ARRAY(
        SELECT DISTINCT value FROM unnest(
          COALESCE(phrases, '{}') ||
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(proposal.matcher_patterns->'phrases', '[]'::jsonb)))
        ) AS value
      ),
      updated_at = NOW()
  WHERE id = proposal.intent_id;

  UPDATE public.compiler_proposals
  SET message_text = final_message,
      approval_status = 'approved',
      approved_response_id = response_uuid,
      approved_by = admin_uuid,
      approved_at = NOW(),
      approved_with_signals = review_signals,
      edited_by_human = approved_message IS NOT NULL AND approved_message IS DISTINCT FROM proposal.message_text
  WHERE id = proposal.id;

  RETURN response_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_compiler_proposal(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_compiler_proposal(UUID, UUID, JSONB) TO service_role;

CREATE TRIGGER update_compiler_materials_updated_at
BEFORE UPDATE ON public.compiler_materials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_compiler_runs_updated_at
BEFORE UPDATE ON public.compiler_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_compiler_coverage_updated_at
BEFORE UPDATE ON public.compiler_coverage
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_compiler_proposals_updated_at
BEFORE UPDATE ON public.compiler_proposals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.compiler_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compiler_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compiler_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compiler_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compiler_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compiler_proposal_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_fact_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_compiler_materials" ON public.compiler_materials FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_compiler_runs" ON public.compiler_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_compiler_facts" ON public.compiler_facts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_compiler_coverage" ON public.compiler_coverage FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_compiler_proposals" ON public.compiler_proposals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_compiler_proposal_facts" ON public.compiler_proposal_facts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_response_fact_dependencies" ON public.response_fact_dependencies FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "active_admin_all_compiler_materials" ON public.compiler_materials FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active)) WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active));
CREATE POLICY "active_admin_all_compiler_runs" ON public.compiler_runs FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active)) WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active));
CREATE POLICY "active_admin_all_compiler_facts" ON public.compiler_facts FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active)) WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active));
CREATE POLICY "active_admin_all_compiler_coverage" ON public.compiler_coverage FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active)) WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active));
CREATE POLICY "active_admin_all_compiler_proposals" ON public.compiler_proposals FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active)) WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active));
CREATE POLICY "active_admin_all_compiler_proposal_facts" ON public.compiler_proposal_facts FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active)) WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active));
CREATE POLICY "active_admin_all_response_fact_dependencies" ON public.response_fact_dependencies FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active)) WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = (SELECT auth.uid()) AND a.is_active));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.compiler_materials,
  public.compiler_runs,
  public.compiler_facts,
  public.compiler_coverage,
  public.compiler_proposals,
  public.compiler_proposal_facts,
  public.response_fact_dependencies
TO authenticated;

GRANT ALL ON TABLE
  public.compiler_materials,
  public.compiler_runs,
  public.compiler_facts,
  public.compiler_coverage,
  public.compiler_proposals,
  public.compiler_proposal_facts,
  public.response_fact_dependencies
TO service_role;

INSERT INTO public.bot_config (config_key, config_value, config_type, description, category, is_editable)
VALUES
  ('ai_extraction_model', 'gpt-5.4', 'string', 'Modelo capaz usado para leer material y extraer hechos', 'ai', true),
  ('ai_writing_model', 'gpt-5.4-mini', 'string', 'Modelo economico usado para redactar propuestas', 'ai', true)
ON CONFLICT (config_key) DO NOTHING;

-- El material comercial no se mezcla con los adjuntos públicos que WhatsApp
-- necesita descargar. El compilador lo abre con URLs firmadas de corta vida.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'compiler-materials',
  'compiler-materials',
  false,
  26214400,
  ARRAY[
    'text/plain',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;
