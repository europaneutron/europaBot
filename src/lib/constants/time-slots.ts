/**
 * Constantes estáticas del bot (hardcoded)
 * 
 * IMPORTANTE: Solo incluir aquí configuraciones que NO deben ser
 * modificables desde el dashboard.
 * 
 * La mayoría de mensajes y configuraciones están en bot_config (BD).
 */

/**
 * Horarios disponibles para citas
 * Estos son los slots de tiempo que el bot ofrece
 */
export const TIME_SLOTS = [
  { label: '9:00 AM', value: '09:00', hour24: 9 },
  { label: '11:00 AM', value: '11:00', hour24: 11 },
  { label: '1:00 PM', value: '13:00', hour24: 13 },
  { label: '3:00 PM', value: '15:00', hour24: 15 },
  { label: '5:00 PM', value: '17:00', hour24: 17 },
] as const;

/**
 * Días de la semana disponibles para citas (lunes a viernes)
 */
export const AVAILABLE_WEEKDAYS = [1, 2, 3, 4, 5] as const; // 1=lunes, 5=viernes

/**
 * Nombres de días en español
 */
export const WEEKDAY_NAMES = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
} as const;

/**
 * Verificar si un día es válido para citas (lunes a viernes)
 */
export function isValidWeekday(dayOfWeek: number): boolean {
  return AVAILABLE_WEEKDAYS.includes(dayOfWeek as typeof AVAILABLE_WEEKDAYS[number]);
}

/**
 * Verificar si una hora está en los slots disponibles
 */
export function isValidTimeSlot(time: string): boolean {
  return TIME_SLOTS.some(slot => slot.value === time || slot.label === time);
}

/**
 * Obtener el slot de tiempo más cercano a una hora dada
 */
export function findClosestTimeSlot(hour24: number): typeof TIME_SLOTS[number] | null {
  const validSlots = TIME_SLOTS.filter(slot => slot.hour24 >= hour24);
  return validSlots.length > 0 ? validSlots[0] : null;
}

/**
 * Formatear fecha para mostrar al usuario
 */
export function formatDateForDisplay(date: Date): string {
  const dayName = WEEKDAY_NAMES[date.getDay() as keyof typeof WEEKDAY_NAMES];
  const day = date.getDate();
  const month = date.toLocaleDateString('es-MX', { month: 'long' });
  
  return `${dayName} ${day} de ${month}`;
}
