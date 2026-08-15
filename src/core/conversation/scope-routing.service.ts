import { FuzzyMatcher } from '@/core/intent-engine/fuzzy-matcher';
import { ROOT_SCOPE_ID, scopeRepository } from '@/data/repositories/scope.repository';
import {
  scopeRoutingRepository,
  type ScopeAlias,
} from '@/data/repositories/scope-routing.repository';
import { userRepository } from '@/data/repositories/user.repository';
import type { IntentConfiguration } from '@/types/intent.types';

/**
 * Ventana de inactividad tras la cual el foco deja de aplicarse. Coincide con
 * la ventana de atención al cliente de WhatsApp, que es el punto en el que la
 * plataforma y el propio lead dan la conversación por terminada.
 */
export const SCOPE_FOCUS_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ScopeFocusSource = 'override' | 'referral' | 'alias' | 'session' | 'single' | 'root';

export interface ScopeRoutingResult {
  scopeId: string;
  hasFocus: boolean;
  source: ScopeFocusSource;
  previousScopeId: string | null;
  aliasAmbiguous: boolean;
}

interface ScopeRoutingInput {
  userId: string;
  message: string;
  referralAdId?: string;
  scopeOverride?: string;
}

export class ScopeRoutingService {
  async getPersistedScope(userId: string): Promise<string> {
    const session = await userRepository.getSession(userId);
    const focusUpdatedAt = session?.scope_focus_updated_at
      ? new Date(session.scope_focus_updated_at).getTime()
      : 0;

    if (
      session?.current_scope_id &&
      focusUpdatedAt > 0 &&
      Date.now() - focusUpdatedAt < SCOPE_FOCUS_WINDOW_MS &&
      await scopeRepository.isReachableScope(session.current_scope_id)
    ) {
      return session.current_scope_id;
    }

    const availableScopes = await scopeRoutingRepository.getAvailableScopes();
    return availableScopes.length === 1 ? availableScopes[0].id : ROOT_SCOPE_ID;
  }

  async resolve(input: ScopeRoutingInput): Promise<ScopeRoutingResult> {
    const session = await userRepository.getSession(input.userId);
    const availableScopes = await scopeRoutingRepository.getAvailableScopes();
    // El foco puede apuntar a cualquier alcance alcanzable, no solo a una rama
    // de primer nivel: un lead puede estar hablando de un modelo concreto.
    const reachableIds = await scopeRepository.getReachableScopeIds();
    const previousScopeId = session?.current_scope_id ?? null;

    let nextScopeId: string | null = null;
    let source: ScopeFocusSource = 'root';

    if (input.scopeOverride && await scopeRepository.isReachableScope(input.scopeOverride)) {
      nextScopeId = input.scopeOverride;
      source = 'override';
    } else if (input.referralAdId) {
      nextScopeId = await scopeRoutingRepository.findActiveScopeByAd(input.referralAdId);
      if (nextScopeId) source = 'referral';
    }

    const aliasMatch = await this.detectAlias(input.message);
    if (!nextScopeId && aliasMatch.scopeId) {
      nextScopeId = aliasMatch.scopeId;
      source = 'alias';
    }

    const focusUpdatedAt = session?.scope_focus_updated_at
      ? new Date(session.scope_focus_updated_at).getTime()
      : 0;
    const sessionFocusIsFresh = Boolean(
      previousScopeId &&
      reachableIds.has(previousScopeId) &&
      focusUpdatedAt > 0 &&
      Date.now() - focusUpdatedAt < SCOPE_FOCUS_WINDOW_MS
    );

    if (!nextScopeId && sessionFocusIsFresh) {
      nextScopeId = previousScopeId;
      source = 'session';
    }

    if (!nextScopeId && availableScopes.length === 1) {
      nextScopeId = availableScopes[0].id;
      source = 'single';
    }

    if (nextScopeId) {
      await userRepository.setScopeFocus(input.userId, nextScopeId, previousScopeId);
      return {
        scopeId: nextScopeId,
        hasFocus: true,
        source,
        previousScopeId: previousScopeId === nextScopeId ? session?.previous_scope_id ?? null : previousScopeId,
        aliasAmbiguous: aliasMatch.ambiguous,
      };
    }

    if (previousScopeId && !sessionFocusIsFresh) {
      await userRepository.clearScopeFocus(input.userId);
    }

    return {
      scopeId: ROOT_SCOPE_ID,
      hasFocus: false,
      source: 'root',
      previousScopeId: session?.previous_scope_id ?? null,
      aliasAmbiguous: aliasMatch.ambiguous,
    };
  }

  private async detectAlias(message: string): Promise<{ scopeId: string | null; ambiguous: boolean }> {
    const aliases = await scopeRoutingRepository.getActiveAliases();
    if (aliases.length === 0) return { scopeId: null, ambiguous: false };

    const matcher = new FuzzyMatcher(aliases.map(alias => this.toMatcherIntent(alias)));
    const words = message.trim().split(/\s+/).filter(Boolean);
    const maxWords = Math.max(...aliases.map(alias => alias.alias.trim().split(/\s+/).length));
    const matchedScopeIds = new Set<string>();

    for (let size = 1; size <= Math.min(maxWords, words.length); size++) {
      for (let start = 0; start + size <= words.length; start++) {
        const result = matcher.detectIntent(words.slice(start, start + size).join(' '));
        for (const match of result.all_matches) {
          if (match.scope_id) matchedScopeIds.add(match.scope_id);
        }
      }
    }

    if (matchedScopeIds.size > 1) {
      console.warn('Scope alias is ambiguous; preserving the current focus', {
        scopeIds: Array.from(matchedScopeIds),
      });
      return { scopeId: null, ambiguous: true };
    }

    return { scopeId: matchedScopeIds.values().next().value ?? null, ambiguous: false };
  }

  private toMatcherIntent(alias: ScopeAlias): IntentConfiguration {
    const isSingleWord = !alias.alias.trim().includes(' ');
    return {
      id: alias.id,
      scope_id: alias.scope_id,
      intent_name: alias.id,
      display_name: alias.alias,
      keywords: isSingleWord ? [alias.alias] : [],
      synonyms: [],
      typos: [],
      phrases: [alias.alias],
      min_confidence: 0.75,
      priority: 0,
      response_type: 'text',
      is_active: true,
      is_checkpoint: false,
    };
  }
}

export const scopeRoutingService = new ScopeRoutingService();
