/**
 * Lista de teléfonos del camino con IA tal como se captura en Ajustes. Se guarda
 * como arreglo JSON de dígitos (con lada de país), igual que llegan de Meta.
 */

export interface ParsedPhones {
  phones: string[];
  invalid: string[];
}

export function parsePhonesInput(text: string): ParsedPhones {
  const phones: string[] = [];
  const invalid: string[] = [];
  for (const entry of text.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean)) {
    const digits = entry.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) invalid.push(entry);
    else if (!phones.includes(digits)) phones.push(digits);
  }
  return { phones, invalid };
}

export function phonesToInput(stored: string): string {
  try {
    const parsed: unknown = JSON.parse(stored || '[]');
    return Array.isArray(parsed) ? parsed.map(String).join('\n') : '';
  } catch {
    return '';
  }
}
