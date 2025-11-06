/**
 * Templates de mensajes de fallback por nivel
 * Centralizados para facilitar mantenimiento
 */

export const FALLBACK_MESSAGES = {
  /**
   * Nivel 1: Primera vez que no entiende
   * Pregunta de clarificación con opciones generales
   */
  LEVEL_1: 
    '🤔 Disculpa, no estoy seguro de entender.\n\n' +
    '¿Preguntas sobre:\n' +
    '• Precios y costos\n' +
    '• Ubicación del proyecto\n' +
    '• Modelos de casas\n' +
    '• Opciones de crédito\n' +
    '• Seguridad\n' +
    '• Información general (brochure)\n\n' +
    'Por favor, repite tu pregunta con otras palabras.',

  /**
   * Nivel 2: Segunda vez que no entiende
   * Menú numerado más específico
   */
  LEVEL_2:
    'Te muestro las opciones principales:\n\n' +
    '1️⃣ Precio - Costo de lotes y casas\n' +
    '2️⃣ Ubicación - Dirección y cómo llegar\n' +
    '3️⃣ Modelos - Tipos de casas disponibles\n' +
    '4️⃣ Créditos - Financiamiento e Infonavit\n' +
    '5️⃣ Seguridad - Vigilancia del fraccionamiento\n' +
    '6️⃣ Brochure - Información completa en PDF\n\n' +
    'Escribe el número o el nombre del tema que te interesa.',

  /**
   * Nivel 3: Derivación a asesor
   * Solicitar nombre para conectar con asesor humano
   */
  LEVEL_3_DERIVATION:
    'Veo que necesitas información más específica.\n\n' +
    '👨‍💼 Te voy a conectar con uno de nuestros asesores para que te ayude personalmente.\n\n' +
    '¿Cuál es tu nombre completo?',

  /**
   * Mensaje de confirmación después de capturar nombre
   * @param userName - Nombre del usuario
   * @param businessHours - Horario de atención (ej: "de 9am a 6pm")
   */
  CONFIRMATION_TEMPLATE: (userName: string, businessHours: string) =>
    `Gracias ${userName}. Un asesor se comunicará contigo vía WhatsApp ${businessHours}.\n\n` +
    'Mientras tanto, puedo ayudarte con:\n' +
    '• Precios y modelos disponibles\n' +
    '• Ubicación y amenidades\n' +
    '• Opciones de financiamiento\n' +
    '• Información general (brochure)\n\n' +
    '¿Hay algo en lo que pueda ayudarte ahora?'
} as const;
