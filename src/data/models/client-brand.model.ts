/**
 * La identidad del negocio: cómo se llama y cómo llama a sus proyectos.
 *
 * Vivía en `onboarding.model.ts`, junto a los tipos del recorrido guiado.
 * Al retirar el compilador y el onboarding se separa: la fila
 * `client_brand_config` es de Ajustes → El negocio, no del onboarding.
 */
export type BrandTone = 'friendly' | 'direct' | 'formal';

export interface ClientBrandConfig {
  root_scope_id: string;
  business_name: string | null;
  project_singular: string;
  project_plural: string;
  tone: BrandTone;
  is_configured: boolean;
  use_composed_greeting: boolean;
  created_at: string;
  updated_at: string;
}
