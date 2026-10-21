import type { CatalogValue } from '@/data/models/catalog-value.model';

export interface MoneyAmount {
  text: string;
  amount: number;
  index: number;
  tolerance: number;
}

// En español mexicano la coma agrupa millares; también se admite coma decimal
// cuando no forma grupos de tres, para reconocer la prosa del modelo.
function parseAmount(value: string): number {
  return Number(/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value)
    ? value.replace(/,/g, '') : value.replace(',', '.'));
}

export function extractMoneyAmounts(text: string): MoneyAmount[] {
  const pattern = /(?<![A-Za-zÁÉÍÓÚÜÑáéíóúüñ\d_])(?:(?:MXN|USD)\s*|\$\s*)?(-?\d+(?:[,.]\d+)*)(?:\s*(millones?|millón|mdp|mil|k|m)(?![A-Za-zÁÉÍÓÚÜÑáéíóúüñ\d]))?(?:\s*(?:pesos|MXN|USD)(?![A-Za-zÁÉÍÓÚÜÑáéíóúüñ\d]))?/gi;
  const amounts: MoneyAmount[] = [];
  for (const match of Array.from(text.matchAll(pattern))) {
    const raw = match[0];
    const unit = match[2]?.toLowerCase();
    const currencyMarker = /\$|mxn|usd|pesos/i.test(raw);
    if (!unit && !currencyMarker) continue;
    if (unit === 'm' && !currencyMarker) continue;
    const millions = !!unit && /^(?:millones?|millón|mdp|m)$/.test(unit);
    const multiplier = millions ? 1_000_000 : unit ? 1_000 : 1;
    const amount = parseAmount(match[1]) * multiplier;
    // Se limita a cinco mil pesos aun cuando la expresión tenga poca precisión:
    // redondear "2 millones" no justifica aceptar cualquier precio cercano.
    const decimals = match[1].match(/[.,](\d+)$/)?.[1].length ?? 0;
    const tolerance = millions ? Math.min(5_000, 0.5 * 10 ** (6 - decimals)) : 0.005;
    amounts.push({ text: raw, amount, index: match.index!, tolerance });
  }
  return amounts;
}

export interface AllowedMoney {
  /** Valores del catálogo: además de permitidos, de ellos salen las sumas y diferencias. */
  catalog: readonly number[];
  /** Cifras ya presentes en la guía (respuestas interpoladas) o escritas por la persona. */
  quoted?: readonly number[];
}

const matches = (value: number, item: MoneyAmount) =>
  Number.isFinite(value) && Math.abs(value - item.amount) <= item.tolerance + Number.EPSILON;

/** Solo de a pares: una cadena de operaciones permitiría llegar a casi cualquier cifra. */
function isPairwiseDerived(item: MoneyAmount, catalog: readonly number[]): boolean {
  const values = Array.from(new Set(catalog.filter(Number.isFinite)));
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if (matches(Math.abs(values[i] - values[j]), item) || matches(values[i] + values[j], item)) return true;
    }
  }
  return false;
}

/** Una cifra es válida si está en el catálogo, ya aparece en la guía o en lo que escribió la persona,
 * o es la suma o diferencia de dos valores del catálogo. */
export function checkMoneyAmounts(text: string, allowed: AllowedMoney | readonly number[]) {
  const { catalog, quoted = [] } = Array.isArray(allowed) ? { catalog: allowed as readonly number[] } : allowed as AllowedMoney;
  const found = extractMoneyAmounts(text);
  const invalid = found.filter(item => !Number.isFinite(item.amount)
    || !(catalog.some(value => matches(value, item)) || quoted.some(value => matches(value, item)) || isPairwiseDerived(item, catalog)));
  return { found, invalid, valid: invalid.length === 0 };
}

/** Importes de un texto libre (guía o mensajes de la persona) para usarlos como cifras permitidas. */
export function collectTextMoneyAmounts(texts: readonly string[]): number[] {
  const amounts = new Set<number>();
  for (const text of texts) for (const item of extractMoneyAmounts(text)) if (Number.isFinite(item.amount)) amounts.add(item.amount);
  return Array.from(amounts).sort((a, b) => a - b);
}

/** Hecho para el reintento: nombra lo rechazado y lo permitido más cercano, sin disculpas ni mención de la validación al lead. */
export function describeMoneyRetry(invalid: readonly MoneyAmount[], allowed: AllowedMoney): string {
  const format = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const pool = Array.from(new Set([...allowed.catalog, ...(allowed.quoted ?? [])])).filter(Number.isFinite);
  const near = new Set<number>();
  for (const item of invalid) {
    pool.sort((a, b) => Math.abs(a - item.amount) - Math.abs(b - item.amount)).slice(0, 4).forEach(value => near.add(value));
  }
  return [
    `Las cifras ${invalid.map(item => `"${item.text.trim()}"`).join(', ')} de tu borrador no están en la guía ni las escribió la persona.`,
    'Solo puedes decir cifras que aparecen en la guía, cifras que la persona escribió en esta conversación, o la suma o diferencia exacta de dos precios del catálogo.',
    near.size ? `Cifras documentadas cercanas: ${Array.from(near).sort((a, b) => a - b).map(format).join(', ')}.` : '',
    'Redacta de nuevo la respuesta final para la persona con cifras permitidas o sin la cifra; un asesor confirma lo que la guía no dice. No menciones esta revisión ni te disculpes.',
  ].filter(Boolean).join(' ');
}

/** El tipo del compilador puede ser text: la evidencia monetaria también vive en el contenido. */
export function collectCatalogMoneyAmounts(
  catalog: readonly Pick<CatalogValue, 'value' | 'value_type' | 'unit'>[]
): number[] {
  const amounts = new Set<number>();
  for (const row of catalog) {
    if (!['money', 'text', 'number'].includes(row.value_type)) continue;
    const values = Array.isArray(row.value) ? row.value : [row.value];
    for (const value of values) {
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      const text = String(value).trim();
      const found = extractMoneyAmounts(row.unit ? `${text} ${row.unit}` : text);
      for (const item of found) {
        if (Number.isFinite(item.amount)) amounts.add(item.amount);
      }
      // Solo la declaración money justifica interpretar una cifra sin moneda.
      // Una recámara o un área numérica no autorizan un precio con esa cifra.
      if (row.value_type === 'money' && found.length === 0 && /^-?\d+(?:[,.]\d+)*$/.test(text)) {
        const amount = parseAmount(text);
        if (Number.isFinite(amount)) amounts.add(amount);
      }
    }
  }
  return Array.from(amounts).sort((a, b) => a - b);
}
