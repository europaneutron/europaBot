import type { ScopedRow } from '@/data/models/scope.model';

export const CATALOG_VALUE_TYPES = [
  'text',
  'money',
  'date',
  'contractual',
  'number',
  'location',
] as const;

export type CatalogValueType = typeof CATALOG_VALUE_TYPES[number];

export interface CatalogValue extends ScopedRow {
  id: string;
  scope_id: string;
  value_key: string;
  // Un arreglo cuando el material da varios hechos con la misma clave: las
  // amenidades de un desarrollo, los creditos que acepta, los servicios que
  // incluye. Una fila por alcance y clave sigue siendo la regla.
  value: string | number | boolean | Array<string | number | boolean>;
  value_type: CatalogValueType;
  unit: string | null;
  edited_by_human: boolean;
  edited_by: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  scopes?: { name: string; parent_id: string | null } | null;
}

export interface CatalogValueInput {
  value: unknown;
  valueType: CatalogValueType;
  unit?: string | null;
}
