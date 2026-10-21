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

export function checkMoneyAmounts(text: string, catalogMoneyValues: readonly number[]) {
  const found = extractMoneyAmounts(text);
  const invalid = found.filter(item => !Number.isFinite(item.amount) || !catalogMoneyValues.some(value =>
    Number.isFinite(value) && Math.abs(value - item.amount) <= item.tolerance + Number.EPSILON
  ));
  return { found, invalid, valid: invalid.length === 0 };
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
