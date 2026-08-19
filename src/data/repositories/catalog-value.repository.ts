import { z } from 'zod';
import { supabaseServer } from '@/services/supabase/server-client';
import { scopeRepository } from '@/data/repositories/scope.repository';
import {
  CATALOG_VALUE_TYPES,
  type CatalogReplacementWarning,
  type CatalogValue,
  type CatalogValueInput,
  type CatalogValueType,
} from '@/data/models/catalog-value.model';

const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const typeSchema = z.enum(CATALOG_VALUE_TYPES);

function normalizeInput(input: CatalogValueInput): {
  value: string | number | boolean;
  value_type: CatalogValueType;
  unit: string | null;
} {
  const valueType = typeSchema.parse(input.valueType);
  const value = scalarSchema.parse(input.value);
  const unit = input.unit?.trim() || null;

  if (typeof value === 'string' && !value.trim()) {
    throw new Error('El valor no puede quedar vacío');
  }
  if (valueType === 'number' && !Number.isFinite(Number(value))) {
    throw new Error('El valor debe ser numérico');
  }
  if (valueType === 'money' && !/[0-9]/.test(String(value))) {
    throw new Error('El importe debe contener una cantidad');
  }
  if (valueType === 'date' && Number.isNaN(Date.parse(String(value)))) {
    throw new Error('La fecha no tiene un formato válido');
  }

  return {
    value: valueType === 'number' ? Number(value) : value,
    value_type: valueType,
    unit,
  };
}

export function formatCatalogValue(value: Pick<CatalogValue, 'value' | 'value_type' | 'unit'>): string {
  // Una lista se lee como la enumeraria una persona: "a, b y c". Es el caso de
  // las amenidades, los creditos aceptados y los servicios incluidos, que el
  // material da como varios hechos con la misma clave.
  if (Array.isArray(value.value)) {
    const parts = value.value
      .map(item => formatCatalogValue({ ...value, value: item as CatalogValue['value'] }))
      .filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  }

  // El compilador guarda las cifras del material como texto --"2980000"--, asi
  // que un importe salia crudo al lead: "El precio desde es 2980000". Un texto
  // que es solo digitos se trata como la cifra que es; uno que ya viene escrito
  // ("$1,850,000 MXN") se respeta tal cual.
  const bareNumber = typeof value.value === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(value.value)
    ? Number(value.value)
    : null;
  if (bareNumber !== null && (value.value_type === 'money' || value.value_type === 'number')) {
    return formatCatalogValue({ ...value, value: bareNumber });
  }
  if (typeof value.value === 'string') return value.value;

  if (typeof value.value === 'number' && value.value_type === 'money') {
    const currency = value.unit && /^[A-Z]{3}$/.test(value.unit) ? value.unit : 'MXN';
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value.value);
  }

  return `${String(value.value)}${value.unit ? ` ${value.unit}` : ''}`;
}

function compactCatalogDetail(value: CatalogValue): string {
  const formatted = formatCatalogValue(value);
  if (value.value_type !== 'money' && !/(?:precio|price|costo)/i.test(value.value_key)) {
    return formatted;
  }

  const amount = Number(formatted.replace(/[^0-9.,]/g, '').replace(/,/g, ''));
  if (!Number.isFinite(amount)) return formatted;
  if (amount >= 1_000_000) return `$${Number((amount / 1_000_000).toFixed(2))}M`;
  if (amount >= 1_000) return `$${Number((amount / 1_000).toFixed(0))}K`;
  return formatted;
}

export class CatalogValueRepository {
  /**
   * Solo los alcances vivos. Cada corrida en modo sustituir retira los
   * alcances anteriores sin borrarlos, asi que hay varias filas con el mismo
   * nombre --tres "Residencial Altabrisa", una viva y dos de corridas
   * pasadas--, cada una con sus valores. La tabla los enseñaba todos y la
   * misma fila aparecia tres veces sin nada que las distinguiera.
   */
  async listForTree(scopeId: string, client: any = supabaseServer): Promise<CatalogValue[]> {
    const [descendants, reachable] = await Promise.all([
      scopeRepository.getDescendantIds(scopeId, client),
      scopeRepository.getReachableScopeIds(client),
    ]);
    const descendantIds = descendants.filter(id => reachable.has(id));
    if (descendantIds.length === 0) return [];

    const { data, error } = await client
      .from('catalog_values')
      .select('*, scopes(name, parent_id), compiler_materials!catalog_values_source_material_id_fkey(original_filename)')
      .in('scope_id', descendantIds)
      .order('value_key');
    if (error) throw error;
    return (data || []) as CatalogValue[];
  }

  async listAll(client: any = supabaseServer): Promise<CatalogValue[]> {
    const { data, error } = await client
      .from('catalog_values')
      .select('*');
    if (error) throw error;
    return (data || []) as CatalogValue[];
  }

  async getResolvedValues(
    scopeId: string,
    client: any = supabaseServer
  ): Promise<CatalogValue[]> {
    const rows = await this.listAll(client);
    return scopeRepository.resolveRows(rows, scopeId, row => row.value_key, client);
  }

  async getResolvedVariables(
    scopeId: string,
    client: any = supabaseServer
  ): Promise<Record<string, string>> {
    const values = await this.getResolvedValues(scopeId, client);
    return Object.fromEntries(values.map(value => [value.value_key, formatCatalogValue(value)]));
  }

  /**
   * El dato que distingue una opcion de sus hermanas. Solo cuenta lo propio:
   * un valor heredado es, por definicion, el mismo para todas, y ponerlo en la
   * etiqueta las vuelve indistinguibles. Dos desarrollos sin precio propio
   * salian como "Residencial · $780K" y "Residencial · $780K", los dos con el
   * precio de los lotes que colgaba de la raiz.
   */
  async getDistinctiveDetail(
    scopeId: string,
    client: any = supabaseServer
  ): Promise<string> {
    // Y solo el precio. El respaldo aceptaba cualquier clave parecida a una
    // ficha, y sin contexto no distingue nada: Altabrisa salia como
    // "Residencial Alt · sí" y Aura como "Modelo Aura · 3". Un numero suelto
    // sin su unidad no ayuda a elegir. Sin precio propio, la opcion es su
    // nombre, que ya distingue.
    const selected = (await this.listAll(client)).find(value => (
      value.scope_id === scopeId
      && /(?:^|_)(?:precio|price|costo)(?:_|$)/i.test(value.value_key)
    ));
    return selected ? compactCatalogDetail(selected) : '';
  }

  async updateValue(
    valueId: string,
    input: CatalogValueInput,
    adminId: string,
    client: any = supabaseServer
  ): Promise<CatalogValue> {
    const normalized = normalizeInput(input);
    const { data, error } = await client
      .from('catalog_values')
      .update({
        ...normalized,
        edited_by_human: true,
        edited_by: adminId,
        edited_at: new Date().toISOString(),
      })
      .eq('id', valueId)
      .select('*')
      .single();
    if (error) throw error;
    return data as CatalogValue;
  }

  async getReplacementWarnings(
    run: { id: string; replacement_mode: 'replace' | 'add' },
    client: any = supabaseServer
  ): Promise<CatalogReplacementWarning[]> {
    if (run.replacement_mode === 'add') return [];

    const [factsResult, catalogResult, scopes] = await Promise.all([
      client
        .from('compiler_facts')
        .select('scope_id, fact_key, fact_value, is_contradictory, provenance_confidence, created_at')
        .eq('run_id', run.id),
      client
        .from('catalog_values')
        .select('id, scope_id, value_key, value, value_type, unit')
        .eq('edited_by_human', true),
      scopeRepository.getScopes(client),
    ]);
    if (factsResult.error) throw factsResult.error;
    if (catalogResult.error) throw catalogResult.error;

    const scopeNames = new Map(scopes.map(scope => [scope.id, scope.name]));
    const facts = (factsResult.data || [])
      .filter((fact: any) => !fact.is_contradictory)
      .sort((left: any, right: any) => (
        Number(right.provenance_confidence) - Number(left.provenance_confidence)
        || right.created_at.localeCompare(left.created_at)
      ));
    const incoming = new Map<string, any>();
    for (const fact of facts) {
      const key = `${fact.scope_id}:${fact.fact_key}`;
      if (!incoming.has(key)) incoming.set(key, fact);
    }

    return (catalogResult.data || []).flatMap((current: any) => {
      const fact = incoming.get(`${current.scope_id}:${current.value_key}`);
      if (!fact || JSON.stringify(fact.fact_value) === JSON.stringify(current.value)) return [];
      return [{
        catalogValueId: current.id,
        scopeId: current.scope_id,
        scopeName: scopeNames.get(current.scope_id) || 'Sin nombre',
        valueKey: current.value_key,
        currentValue: formatCatalogValue(current as CatalogValue),
        incomingValue: typeof fact.fact_value === 'string'
          ? fact.fact_value
          : JSON.stringify(fact.fact_value),
      }];
    });
  }
}

export const catalogValueRepository = new CatalogValueRepository();
