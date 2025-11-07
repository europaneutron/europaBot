/**
 * Utilidades para exportar datos a CSV
 */

export interface CSVColumn<T> {
  key: keyof T | string;
  header: string;
  format?: (value: any, item: T) => string;
}

export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  columns: CSVColumn<T>[],
  filename: string
) {
  if (!data || data.length === 0) {
    throw new Error('No hay datos para exportar');
  }

  // Generar headers
  const headers = columns.map((col) => col.header).join(',');

  // Generar filas
  const rows = data.map((item) => {
    return columns
      .map((col) => {
        const key = col.key as string;
        let value: any;

        // Soporte para claves anidadas (ej: 'user.name')
        if (key.includes('.')) {
          const keys = key.split('.');
          value = keys.reduce((obj, k) => obj?.[k], item);
        } else {
          value = item[key];
        }

        // Aplicar formato si existe
        if (col.format) {
          value = col.format(value, item);
        }

        // Escapar y formatear valor
        return formatCSVValue(value);
      })
      .join(',');
  });

  // Combinar headers y rows
  const csv = [headers, ...rows].join('\n');

  // Descargar archivo
  downloadCSV(csv, filename);
}

function formatCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Convertir arrays a string separado por punto y coma
  if (Array.isArray(value)) {
    value = value.join('; ');
  }

  // Convertir a string
  let str = String(value);

  // Escapar comillas dobles
  str = str.replace(/"/g, '""');

  // Envolver en comillas si contiene caracteres especiales
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    str = `"${str}"`;
  }

  return str;
}

function downloadCSV(content: string, filename: string) {
  // Añadir BOM para compatibilidad con Excel UTF-8
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });

  // Crear link temporal y descargar
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Liberar memoria
  URL.revokeObjectURL(url);
}

/**
 * Genera nombre de archivo con timestamp
 */
export function generateCSVFilename(prefix: string): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  return `${prefix}_${timestamp}.csv`;
}
