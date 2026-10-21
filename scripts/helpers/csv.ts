/** CSV mínimo (RFC 4180) para las hojas de calibración: comillas dobles, saltos de línea dentro de campos y BOM opcional. */
export function toCsv(header: string[], rows: string[][]): string {
  const escape = (value: string) => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [header, ...rows].map(row => row.map(escape).join(','));
  // El BOM hace que Excel y Numbers abran el archivo como UTF-8.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += char;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(item => item.some(cell => cell !== ''));
}
