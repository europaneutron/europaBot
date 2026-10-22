const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const BUSINESS_TIME_ZONE = 'America/Mexico_City';

/**
 * Medianoche de "hoy" según el calendario del negocio, como fecha local del proceso.
 *
 * En Vercel el proceso corre en UTC, seis horas adelante de México: de las 18:00 en
 * adelante `new Date()` ya es el día siguiente. Con eso un formulario con fecha de
 * hoy se rechazaba como pasado y "mañana" caía en pasado mañana. Se toman el año, el
 * mes y el día en la zona del negocio y se arma la fecha local con ellos, igual que
 * `parseIsoDate`, para que las comparaciones entre ambas sigan siendo coherentes.
 */
export function businessToday(now: Date = new Date(), timeZone: string = BUSINESS_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return new Date(value('year'), value('month') - 1, value('day'));
}

/**
 * La fecha de una cita en palabras y sin relativos: "jueves 22 de octubre".
 *
 * Un "mañana" o un "hoy" dentro de un mensaje que se guarda y se vuelve a leer
 * horas después dice otra cosa: la confirmación "para el Mañana" se leyó al
 * día siguiente como una fecha distinta de la elegida. Solo se agrega el año
 * cuando no es el actual.
 */
export function formatAppointmentDate(isoDate: string, today: Date = businessToday()): string {
  const date = parseIsoDate(isoDate);
  const base = `${WEEKDAYS[date.getDay()]} ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === today.getFullYear() ? base : `${base} de ${date.getFullYear()}`;
}

/** "hoy" o "mañana" cuando la cita cae en uno de esos días; para añadirlo a la fecha absoluta, nunca en su lugar. */
export function relativeDayWord(isoDate: string, today: Date = businessToday()): 'hoy' | 'mañana' | null {
  const days = Math.round((parseIsoDate(isoDate).getTime() - startOfDay(today).getTime()) / 86_400_000);
  return days === 0 ? 'hoy' : days === 1 ? 'mañana' : null;
}

/** Fecha absoluta con el relativo entre paréntesis: "jueves 22 de octubre (mañana)". */
export function formatAppointmentDateWithHint(isoDate: string, today: Date = businessToday()): string {
  const word = relativeDayWord(isoDate, today);
  const date = formatAppointmentDate(isoDate, today);
  return word ? `${date} (${word})` : date;
}

/** Postgres devuelve `time` como "12:00:00"; el lead lee "12:00". */
function withoutSeconds(time: string): string {
  return time.slice(0, 5);
}

/** "de 12:00 a 15:00 h". */
export function formatSlotRange(startTime: string, endTime: string): string {
  return `de ${withoutSeconds(startTime)} a ${withoutSeconds(endTime)} h`;
}

/**
 * Rellena la plantilla configurada de la confirmación. La que se sembró dice
 * "para el {fecha} a las {hora}": con la hora como rango, "a las de 12:00 a
 * 15:00" no se lee. El conector se absorbe en el rango para que la plantilla
 * ya guardada no obligue a editar contenido; una plantilla sin ese conector
 * se rellena tal cual.
 */
export function adaptConfirmationTemplate(template: string): string {
  return template.replace(/\s+a las\s+\{hora\}/i, ', {hora}');
}

/** Línea que queda en el historial cuando el lead envía el formulario del WhatsApp Flow. */
export function describeFormSubmission(date: string, slotRange: string, visitorName: string): string {
  return `[Formulario de cita enviado: ${formatAppointmentDate(date)}, ${slotRange}, a nombre de ${visitorName}]`;
}
