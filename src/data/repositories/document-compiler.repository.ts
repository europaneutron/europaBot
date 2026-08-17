import { supabaseServer } from '@/services/supabase/server-client';
import type { ExtractedFact, ReviewSignal } from '@/data/models/document-compiler.model';

export interface CreateMaterialInput {
  scopeId: string;
  kind: 'text' | 'pdf' | 'document';
  filename: string;
  storagePath: string | null;
  mimeType: string;
  plainText: string | null;
  checksum: string;
  adminId: string;
}

export class DocumentCompilerRepository {
  async listRuns() {
    const { data, error } = await supabaseServer
      .from('compiler_runs')
      .select('*, scopes(name)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data || [];
  }

  async createMaterial(input: CreateMaterialInput) {
    const { data, error } = await supabaseServer
      .from('compiler_materials')
      .insert({
        scope_id: input.scopeId,
        material_kind: input.kind,
        original_filename: input.filename,
        storage_path: input.storagePath,
        mime_type: input.mimeType,
        plain_text: input.plainText,
        reading_status: input.kind === 'text' ? 'ready' : 'pending',
        checksum: input.checksum,
        created_by: input.adminId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async createRun(scopeId: string, materialId: string, adminId: string) {
    const { data: previous } = await supabaseServer
      .from('compiler_runs')
      .select('id')
      .eq('scope_id', scopeId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabaseServer
      .from('compiler_runs')
      .insert({
        scope_id: scopeId,
        material_ids: [materialId],
        current_stage: 'extract_facts',
        previous_run_id: previous?.id || null,
        created_by: adminId,
      })
      .select('*')
      .single();
    if (error) throw error;

    const { error: materialError } = await supabaseServer
      .from('compiler_materials')
      .update({ run_id: data.id })
      .eq('id', materialId);
    if (materialError) throw materialError;
    return data;
  }

  async getRun(runId: string) {
    const { data, error } = await supabaseServer
      .from('compiler_runs')
      .select('*')
      .eq('id', runId)
      .single();
    if (error) throw error;
    return data;
  }

  async getMaterials(ids: string[]) {
    const { data, error } = await supabaseServer
      .from('compiler_materials')
      .select('*')
      .in('id', ids);
    if (error) throw error;
    return data || [];
  }

  async getMaterial(id: string) {
    const { data, error } = await supabaseServer
      .from('compiler_materials')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async updateMaterial(id: string, values: Record<string, unknown>) {
    const { error } = await supabaseServer
      .from('compiler_materials')
      .update(values)
      .eq('id', id);
    if (error) throw error;
  }

  async advanceRun(runId: string, values: Record<string, unknown>) {
    const { data, error } = await supabaseServer
      .from('compiler_runs')
      .update(values)
      .eq('id', runId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async assignRunToStructure(
    runId: string,
    projectScopeId: string,
    factScopeById: Map<string, string>
  ): Promise<void> {
    const { data: previousRun, error: previousRunError } = await supabaseServer
      .from('compiler_runs')
      .select('id')
      .eq('scope_id', projectScopeId)
      .eq('status', 'completed')
      .neq('id', runId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousRunError) throw previousRunError;

    const { error: runError } = await supabaseServer
      .from('compiler_runs')
      .update({
        scope_id: projectScopeId,
        previous_run_id: previousRun?.id || null,
      })
      .eq('id', runId);
    if (runError) throw runError;

    const { error: materialError } = await supabaseServer
      .from('compiler_materials')
      .update({ scope_id: projectScopeId })
      .eq('run_id', runId);
    if (materialError) throw materialError;

    const factsByScope = new Map<string, string[]>();
    for (const [factId, scopeId] of Array.from(factScopeById.entries())) {
      const ids = factsByScope.get(scopeId) || [];
      ids.push(factId);
      factsByScope.set(scopeId, ids);
    }
    for (const [scopeId, factIds] of Array.from(factsByScope.entries())) {
      const { error } = await supabaseServer
        .from('compiler_facts')
        .update({ scope_id: scopeId })
        .in('id', factIds);
      if (error) throw error;
    }
  }

  async replaceFacts(runId: string, facts: ExtractedFact[]) {
    const { error: deleteError } = await supabaseServer
      .from('compiler_facts')
      .delete()
      .eq('run_id', runId);
    if (deleteError) throw deleteError;
    if (facts.length === 0) return [];

    const { data, error } = await supabaseServer
      .from('compiler_facts')
      .insert(facts.map(fact => ({
        run_id: runId,
        material_id: fact.materialId,
        scope_id: fact.scopeId,
        fact_key: fact.key,
        subject: fact.subject ?? null,
        fact_value: fact.value,
        fact_type: fact.type,
        page_number: fact.page,
        provenance_confidence: fact.provenanceConfidence,
        fingerprint: fact.fingerprint,
        is_contradictory: fact.contradictory || false,
      })))
      .select('*');
    if (error) throw error;
    return data || [];
  }

  async getFacts(runId: string) {
    const { data, error } = await supabaseServer
      .from('compiler_facts')
      .select('*, compiler_materials(original_filename, storage_path)')
      .eq('run_id', runId)
      .order('fact_key');
    if (error) throw error;
    return data || [];
  }

  async getRecompileContext(previousRunId: string) {
    const [factsResult, proposalsResult] = await Promise.all([
      supabaseServer.from('compiler_facts').select('*').eq('run_id', previousRunId),
      supabaseServer
        .from('compiler_proposals')
        .select('intent_id, edited_by_human, approved_response_id')
        .eq('run_id', previousRunId)
        .eq('approval_status', 'approved'),
    ]);
    if (factsResult.error) throw factsResult.error;
    if (proposalsResult.error) throw proposalsResult.error;
    return { facts: factsResult.data || [], proposals: proposalsResult.data || [] };
  }

  async getSiblingFactSets(scopeId: string, currentRunId: string) {
    const { data: scope, error: scopeError } = await supabaseServer
      .from('scopes')
      .select('parent_id')
      .eq('id', scopeId)
      .single();
    if (scopeError) throw scopeError;
    if (!scope.parent_id) return null;

    const { data: siblings, error: siblingsError } = await supabaseServer
      .from('scopes')
      .select('id')
      .eq('parent_id', scope.parent_id)
      .eq('is_active', true);
    if (siblingsError) throw siblingsError;
    if (!siblings || siblings.length < 2) return null;

    const sets = new Map<string, any[]>();
    for (const sibling of siblings) {
      let runId = currentRunId;
      if (sibling.id !== scopeId) {
        const { data: siblingRun, error: runError } = await supabaseServer
          .from('compiler_runs')
          .select('id')
          .eq('scope_id', sibling.id)
          .in('status', ['waiting_tree_approval', 'waiting_content_approval', 'completed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (runError) throw runError;
        if (!siblingRun) return null;
        runId = siblingRun.id;
      }
      const { data: facts, error: factsError } = await supabaseServer
        .from('compiler_facts')
        .select('*')
        .eq('run_id', runId);
      if (factsError) throw factsError;
      sets.set(sibling.id, facts || []);
    }
    return { parentId: scope.parent_id as string, sets };
  }

  async promoteFacts(factIds: string[], parentId: string) {
    if (factIds.length === 0) return;
    const { error } = await supabaseServer
      .from('compiler_facts')
      .update({ scope_id: parentId })
      .in('id', factIds);
    if (error) throw error;
  }

  async flagUnsupportedResponsesForFacts(factIds: string[]) {
    if (factIds.length === 0) return;
    const { data: dependencies, error: dependencyError } = await supabaseServer
      .from('response_fact_dependencies')
      .select('response_id')
      .in('fact_id', factIds);
    if (dependencyError) throw dependencyError;
    const responseIds = Array.from(new Set((dependencies || []).map(row => row.response_id)));
    if (responseIds.length === 0) return;
    const { error } = await supabaseServer
      .from('bot_responses')
      .update({ review_signals: ['unsupported'] })
      .in('id', responseIds);
    if (error) throw error;
  }

  async replaceCoverage(runId: string, rows: Array<Record<string, unknown>>) {
    const { error: deleteError } = await supabaseServer
      .from('compiler_coverage')
      .delete()
      .eq('run_id', runId);
    if (deleteError) throw deleteError;
    if (rows.length === 0) return [];
    const { data, error } = await supabaseServer
      .from('compiler_coverage')
      .insert(rows)
      .select('*');
    if (error) throw error;
    return data || [];
  }

  async setCoveragePlacementError(coverageId: string, reason: string | null) {
    const { error } = await supabaseServer
      .from('compiler_coverage')
      .update({ placement_error: reason })
      .eq('id', coverageId);
    if (error) throw error;
  }

  async getVisibleIntents(scopeId: string) {
    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .select('*')
      .eq('is_active', true);
    if (error) throw error;
    const { scopeRepository } = await import('@/data/repositories/scope.repository');
    return scopeRepository.resolveRows(data || [], scopeId, row => row.intent_name);
  }

  /**
   * Incluye las apagadas a proposito. Una intencion que el compilador creo y
   * que todavia nadie aprobo esta inactiva: si no se viera aqui, cada
   * recompilacion la trataria como inexistente y perderia el rastro de la
   * propuesta anterior, con ella la senal de "editada a mano".
   */
  async getAllIntents() {
    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .select('*');
    if (error) throw error;
    return data || [];
  }

  async replaceProposals(
    runId: string,
    proposals: Array<{
      coverageId: string;
      scopeId: string;
      intentId: string | null;
      intentName: string;
      displayName: string;
      minConfidence: number;
      priority: number;
      responseKey: string;
      messageText: unknown;
      matcherPatterns: Record<string, string[]>;
      signals: ReviewSignal[];
      factIds: string[];
    }>
  ) {
    const { data, error } = await supabaseServer.rpc('replace_scoped_compiler_proposals', {
      run_uuid: runId,
      proposal_rows: proposals.map(proposal => ({
        coverage_id: proposal.coverageId,
        scope_id: proposal.scopeId,
        intent_id: proposal.intentId,
        intent_name: proposal.intentName,
        display_name: proposal.displayName,
        min_confidence: proposal.minConfidence,
        priority: proposal.priority,
        response_key: proposal.responseKey,
        message_text: proposal.messageText,
        matcher_patterns: proposal.matcherPatterns,
        review_signals: proposal.signals,
        fact_ids: proposal.factIds,
      })),
    });
    if (error) throw error;
    return data || [];
  }

  async getReview(runId: string) {
    const [run, factsResult, coverageResult, proposalsResult] = await Promise.all([
      this.getRun(runId),
      supabaseServer.from('compiler_facts').select('*, compiler_materials(original_filename, storage_path)').eq('run_id', runId),
      supabaseServer.from('compiler_coverage').select('*').eq('run_id', runId).order('status', { ascending: false }),
      supabaseServer
        .from('compiler_proposals')
        .select('*, compiler_proposal_facts(fact_id), intent_configurations(display_name, intent_name), scopes(name)')
        .eq('run_id', runId),
    ]);
    if (factsResult.error) throw factsResult.error;
    if (coverageResult.error) throw coverageResult.error;
    if (proposalsResult.error) throw proposalsResult.error;

    const proposals = (proposalsResult.data || []).sort((left, right) =>
      right.review_signals.length - left.review_signals.length
    );
    const intentIds = Array.from(new Set(proposals.map(proposal => proposal.intent_id)));
    const replacementCandidates = intentIds.length === 0
      ? []
      : await this.getActiveResponsesForIntents(intentIds);
    return {
      run,
      facts: factsResult.data || [],
      coverage: coverageResult.data || [],
      proposals: proposals.map(proposal => ({
        ...proposal,
        replacement_candidates: replacementCandidates.filter(row => row.intent_id === proposal.intent_id),
      })),
    };
  }

  private async getActiveResponsesForIntents(intentIds: string[]) {
    const { data, error } = await supabaseServer
      .from('bot_responses')
      .select('id, intent_id, response_key, message_text, response_type, origin, edited_by_human, created_at')
      .in('intent_id', intentIds)
      .eq('is_active', true)
      .order('order_priority')
      .order('created_at');
    if (error) throw error;
    return data || [];
  }

  async approveTree(runId: string, adminId: string | null) {
    return this.advanceRun(runId, {
      tree_approved_at: new Date().toISOString(),
      tree_approved_by: adminId,
      status: 'running',
      current_stage: 'catalog',
    });
  }

  async approveProposal(
    proposalId: string,
    adminId: string,
    messageText?: unknown,
    confirmReplacement = false
  ) {
    const { data, error } = await supabaseServer.rpc('approve_compiler_proposal', {
      proposal_uuid: proposalId,
      admin_uuid: adminId,
      approved_message: messageText ?? null,
      confirm_replacement: confirmReplacement,
    });
    if (error) throw error;
    return data as string;
  }

  async listResponseCollisions() {
    const { data: intents, error: intentError } = await supabaseServer
      .from('intent_configurations')
      .select('id, scope_id, intent_name, display_name, scopes(name)')
      .eq('is_active', true);
    if (intentError) throw intentError;
    const { data: responses, error: responseError } = await supabaseServer
      .from('bot_responses')
      .select('id, intent_id, response_key, message_text, response_type, origin, edited_by_human, order_priority, created_at')
      .eq('is_active', true)
      .order('order_priority')
      .order('created_at');
    if (responseError) throw responseError;

    const byIntent = new Map<string, any[]>();
    for (const response of responses || []) {
      const rows = byIntent.get(response.intent_id) || [];
      rows.push(response);
      byIntent.set(response.intent_id, rows);
    }
    return (intents || []).flatMap(intent => {
      const rows = byIntent.get(intent.id) || [];
      if (rows.length < 2) return [];
      const supplementalKeys = new Set(['followup', 'maps', 'simulator']);
      const supplemental = rows.filter(row => supplementalKeys.has(row.response_key));
      const primary = rows
        .filter(row => !supplementalKeys.has(row.response_key))
        .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];
      const recommendedRows = primary
        ? [primary, ...supplemental].sort((left, right) => left.order_priority - right.order_priority)
        : [];
      return [{
        ...intent,
        responses: rows,
        recommended_strategy: recommendedRows.length > 1 ? 'combine' : 'keep',
        recommended_response_id: recommendedRows.length > 1 ? null : primary?.id || rows[0].id,
        recommended_response_ids: recommendedRows.map(row => row.id),
      }];
    });
  }

  async resolveResponseCollision(
    intentId: string,
    adminId: string,
    strategy: 'keep' | 'combine',
    keepResponseId?: string,
    combineResponseIds?: string[]
  ) {
    const { data, error } = await supabaseServer.rpc('resolve_response_collision', {
      intent_uuid: intentId,
      admin_uuid: adminId,
      strategy,
      keep_response_uuid: keepResponseId || null,
      combine_response_uuids: combineResponseIds || null,
    });
    if (error) throw error;
    return data as string;
  }

  async rejectProposal(proposalId: string) {
    const { error } = await supabaseServer
      .from('compiler_proposals')
      .update({ approval_status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', proposalId)
      .eq('approval_status', 'pending');
    if (error) throw error;
  }

  async completeRunIfReviewed(runId: string) {
    const { count, error } = await supabaseServer
      .from('compiler_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('run_id', runId)
      .eq('approval_status', 'pending');
    if (error) throw error;
    if ((count || 0) > 0) return;
    await this.advanceRun(runId, {
      status: 'completed',
      current_stage: 'completed',
      completed_at: new Date().toISOString(),
    });
  }

  async getFallbackBacklog(scopeId?: string) {
    let query = supabaseServer
      .from('conversations')
      .select('user_id, message_text, scope_id, direction, was_fallback, sent_at')
      .order('sent_at', { ascending: true })
      .limit(5000);
    if (scopeId) query = query.eq('scope_id', scopeId);
    const { data, error } = await query;
    if (error) throw error;

    let proposalQuery = supabaseServer
      .from('compiler_proposals')
      .select('approval_status, matcher_patterns, coverage_id, compiler_coverage(question, status)');
    if (scopeId) proposalQuery = proposalQuery.eq('scope_id', scopeId);
    const { data: proposalRows, error: proposalError } = await proposalQuery;
    if (proposalError) throw proposalError;

    const normalize = (value: string) => value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const proposals = (proposalRows || []).map((proposal: any) => ({
      ...proposal,
      patterns: Object.values(proposal.matcher_patterns || {})
        .flatMap(value => Array.isArray(value) ? value : [])
        .map(pattern => normalize(String(pattern)))
        .filter(pattern => pattern.length >= 3),
    }));

    const latestInboundByUser = new Map<string, any>();
    const unanswered: any[] = [];
    for (const row of data || []) {
      if (row.direction === 'inbound') {
        if (typeof row.message_text === 'string' && row.message_text.trim()) {
          latestInboundByUser.set(row.user_id, row);
        }
      } else if (row.direction === 'outbound' && row.was_fallback) {
        const inbound = latestInboundByUser.get(row.user_id);
        if (inbound) {
          unanswered.push(inbound);
          latestInboundByUser.delete(row.user_id);
        }
      }
    }

    const grouped = new Map<string, {
      message: string;
      count: number;
      scopeId: string | null;
      coverageId: string | null;
      coverageQuestion: string | null;
    }>();
    for (const row of unanswered) {
      const normalized = normalize(row.message_text);
      const related = proposals.find(proposal =>
        proposal.patterns.some((pattern: string) => normalized.includes(pattern) || pattern.includes(normalized))
      );
      if (related?.approval_status === 'approved') continue;
      const existing = grouped.get(normalized);
      if (existing) existing.count += 1;
      else grouped.set(normalized, {
        message: row.message_text,
        count: 1,
        scopeId: row.scope_id,
        coverageId: related?.coverage_id || null,
        coverageQuestion: related?.compiler_coverage?.question || null,
      });
    }
    return Array.from(grouped.values()).sort((left, right) => right.count - left.count);
  }
}

export const documentCompilerRepository = new DocumentCompilerRepository();
