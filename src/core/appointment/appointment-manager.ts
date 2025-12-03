/**
 * Appointment Manager
 * Lógica de negocio para el flujo de agendamiento de citas
 */

import { appointmentRepository } from '@/data/repositories/appointment.repository';
import { userRepository } from '@/data/repositories/user.repository';
import { configRepository } from '@/data/repositories/config.repository';
import { leadScorer } from '@/core/scoring';
import { whatsappSender } from '@/services/whatsapp/message-sender';
import type { AppointmentFlow, TimeSlot, AppointmentFlowData } from '@/types/appointment.types';

export class AppointmentManager {
  /**
   * Iniciar flujo de agendamiento
   * @param skipConfirmation - Si es true, salta directo a pedir fecha (cuando usuario dice explícitamente "agendar cita")
   */
  async startFlow(userId: string, skipConfirmation: boolean = false): Promise<AppointmentFlow> {
    if (skipConfirmation) {
      // Usuario ya dijo explícitamente que quiere agendar, ir directo a fecha
      await userRepository.updateAppointmentFlowState(userId, 'ask_date');
      
      const yesResponse = await configRepository.get(
        'auto_offer_yes_response',
        '¡Perfecto! Vamos a agendar tu visita. 📅'
      );
      const requestDate = await configRepository.get(
        'appointment_request_date',
        '¿Qué día te gustaría visitarnos? Por favor indica una fecha (ejemplo: mañana, viernes, 15 de noviembre)'
      );
      
      return {
        step: 'ask_date',
        message: `${yesResponse}\n\n${requestDate}`
      };
    }
    
    // Flujo normal: preguntar primero si quiere agendar (usado en auto-offer)
    await userRepository.updateAppointmentFlowState(userId, 'ask_confirmation');

    const message = await configRepository.get(
      'auto_offer_message',
      '¡Veo que estás muy interesado! 🎉 ¿Te gustaría agendar una visita para conocer el fraccionamiento en persona?'
    );

    return {
      step: 'ask_confirmation',
      message
    };
  }

  /**
   * Procesar respuesta según el paso actual del flujo
   */
  async processFlowStep(userId: string, input: string): Promise<AppointmentFlow> {
    const currentStep = await userRepository.getAppointmentFlowState(userId);

    switch (currentStep) {
      case 'ask_confirmation':
        return this.processConfirmation(userId, input);
      
      case 'ask_date':
        return this.processDate(userId, input);
      
      case 'confirm_date':
        return this.processDateConfirmation(userId, input);
      
      case 'ask_time':
        return this.processTimeSlot(userId, input);
      
      case 'ask_name':
        return this.processName(userId, input);
      
      default:
        // No hay flujo activo, iniciar desde cero
        return this.startFlow(userId);
    }
  }

  /**
   * Procesar confirmación inicial
   */
  private async processConfirmation(userId: string, input: string): Promise<AppointmentFlow> {
    const normalized = input.toLowerCase().trim();
    const positiveResponses = ['si', 'sí', 'claro', 'ok', 'dale', 'yes', 'por favor', 'me interesa', 'quiero'];

    if (positiveResponses.some(r => normalized.includes(r))) {
      await userRepository.updateAppointmentFlowState(userId, 'ask_date');
      
      // Obtener mensajes desde configuración
      const yesResponse = await configRepository.get(
        'auto_offer_yes_response',
        '¡Perfecto! Vamos a agendar tu visita. 📅'
      );
      const requestDate = await configRepository.get(
        'appointment_request_date',
        '¿Qué día te gustaría visitarnos? Por favor indica una fecha (ejemplo: mañana, viernes, 15 de noviembre)'
      );
      
      return {
        step: 'ask_date',
        message: `${yesResponse}\n\n${requestDate}`
      };
    } else {
      await userRepository.clearAppointmentFlow(userId);
      
      // Obtener mensaje de rechazo desde configuración
      const noResponse = await configRepository.get(
        'auto_offer_no_response',
        'Entendido, cuando estés listo para agendar una cita puedes pedirme: "Agendar una cita".\n\n¿Hay algo más en lo que pueda ayudarte?'
      );
      
      return {
        step: 'completed',
        message: noResponse
      };
    }
  }

  /**
   * Procesar fecha
   */
  private async processDate(userId: string, input: string): Promise<AppointmentFlow> {
    const parsedDate = this.parseDate(input);
    
    if (!parsedDate) {
      // Generar opciones de ejemplo útiles
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Calcular el próximo sábado
      const nextSaturday = new Date(today);
      const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
      nextSaturday.setDate(today.getDate() + daysUntilSaturday);
      
      // Calcular el próximo domingo
      const nextSunday = new Date(today);
      const daysUntilSunday = (7 - today.getDay()) % 7 || 7;
      nextSunday.setDate(today.getDate() + daysUntilSunday);
      
      const tomorrowStr = tomorrow.toLocaleDateString('es-MX', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
      });
      
      const saturdayStr = nextSaturday.toLocaleDateString('es-MX', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
      });
      
      const sundayStr = nextSunday.toLocaleDateString('es-MX', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
      });
      
      const invalidDateMsg = await configRepository.get(
        'appointment_invalid_date',
        `⚠️ Puede que esa fecha haya pasado o sea inválida.

Por favor, verifica que:
• La fecha sea futura
• Si indicas día y número, que coincidan (ej: "viernes 29" debe ser viernes)
• El formato sea correcto

Puedes escribir:
• "mañana" → ${tomorrowStr}
• "sábado" → ${saturdayStr}
• "domingo" → ${sundayStr}
• Una fecha específica: "25 de diciembre"

¿Qué día prefieres para tu visita?`
      );
      
      return {
        step: 'ask_date',
        message: invalidDateMsg
      };
    }

    // Guardar fecha en estado temporal
    await userRepository.updateAppointmentFlowData(userId, { requested_date: parsedDate });
    await userRepository.updateAppointmentFlowState(userId, 'confirm_date');

    // Formatear fecha para mostrar al usuario
    const dateObj = new Date(parsedDate + 'T00:00:00');
    const dateDisplay = dateObj.toLocaleDateString('es-MX', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });

    // No retornamos mensaje aquí, el webhook lo enviará con botones de confirmación
    return {
      step: 'confirm_date',
      message: '' // Vacío, el webhook enviará el mensaje con botones
    };
  }

  /**
   * Procesar confirmación de fecha
   */
  private async processDateConfirmation(userId: string, input: string): Promise<AppointmentFlow> {
    const normalized = input.toLowerCase().trim();
    
    // Detectar confirmación (Sí / continuar)
    if (normalized === 'confirm_date' || normalized.includes('sí') || normalized.includes('si') || normalized.includes('continuar')) {
      await userRepository.updateAppointmentFlowState(userId, 'ask_time');
      
      return {
        step: 'ask_time',
        message: '' // El webhook enviará el mensaje con botones de horario
      };
    }
    
    // Detectar rechazo (cambiar fecha)
    if (normalized === 'change_date' || normalized.includes('cambiar') || normalized.includes('no')) {
      // Limpiar fecha guardada
      await userRepository.updateAppointmentFlowData(userId, { requested_date: null });
      await userRepository.updateAppointmentFlowState(userId, 'ask_date');
      
      const askDateMsg = await configRepository.get(
        'appointment_ask_date',
        'Sin problema. ¿Qué día te gustaría visitarnos? Por favor indica una fecha (ejemplo: mañana, viernes, 25 de noviembre)'
      );
      
      return {
        step: 'ask_date',
        message: askDateMsg
      };
    }
    
    // Si no entendimos la respuesta
    return {
      step: 'confirm_date',
      message: 'Por favor, selecciona una opción usando los botones.'
    };
  }

  /**
   * Procesar horario (time slot)
   */
  private async processTimeSlot(userId: string, input: string): Promise<AppointmentFlow> {
    const timeSlot = this.parseTimeSlot(input);
    
    if (!timeSlot) {
      // Obtener mensaje de hora inválida desde configuración
      const invalidTime = await configRepository.get(
        'appointment_invalid_time',
        'Esa hora no está disponible. Por favor elige uno de estos horarios:\n9:00 AM, 11:00 AM, 1:00 PM, 3:00 PM o 5:00 PM'
      );
      
      return {
        step: 'ask_time',
        message: invalidTime
      };
    }

    // Guardar horario
    await userRepository.updateAppointmentFlowData(userId, { time_slot: timeSlot });
    await userRepository.updateAppointmentFlowState(userId, 'ask_name');

    return {
      step: 'ask_name',
      message: '¡Perfecto! Solo necesito tu nombre completo para confirmar la cita.'
    };
  }

  /**
   * Procesar nombre y completar cita
   */
  private async processName(userId: string, name: string): Promise<AppointmentFlow> {
    // Obtener datos temporales
    const flowData = await userRepository.getAppointmentFlowData(userId) as AppointmentFlowData;
    
    if (!flowData?.requested_date || !flowData?.time_slot) {
      // Error en el flujo, reiniciar
      await userRepository.clearAppointmentFlow(userId);
      return {
        step: 'completed',
        message: 'Hubo un error. Por favor intenta agendar nuevamente escribiendo "quiero una cita".'
      };
    }

    // Crear cita en BD
    const appointment = await appointmentRepository.create({
      user_id: userId,
      visitor_name: name.trim(),
      requested_date: flowData.requested_date,
      time_slot: flowData.time_slot
    });

    // Obtener info del usuario
    const user = await userRepository.findById(userId);
    if (!user) {
      await userRepository.clearAppointmentFlow(userId);
      return {
        step: 'completed',
        message: 'Hubo un error al procesar tu cita. Por favor intenta nuevamente.'
      };
    }

    // Notificar al agente
    try {
      await this.notifyAgent(appointment, user.phone_number);
    } catch (error) {
      console.error('❌ Error notificando al agente:', error);
      // No bloqueamos el flujo si falla la notificación
    }

    // Limpiar estado del flujo
    await userRepository.clearAppointmentFlow(userId);

    // Actualizar lead score (cita agendada aumenta puntos significativamente)
    await leadScorer.afterAppointmentCreated(userId);

    // Formatear mensaje de confirmación con variables
    const dateDisplay = this.formatDate(flowData.requested_date);
    const timeSlotConfig = await this.getTimeSlotDisplay(flowData.time_slot);
    const address = await configRepository.get(
      'appointment_address',
      'Calle Principal #123, Fraccionamiento Europa, Ciudad'
    );
    
    // Obtener mensaje de confirmación desde configuración
    let confirmationMsg = await configRepository.get(
      'appointment_confirmation',
      '¡Perfecto! Tu cita está agendada para el {fecha} a las {hora}. 📅\n\nTe esperamos en:\n📍 {direccion}\n\n¿Necesitas algo más?'
    );

    // Reemplazar variables
    confirmationMsg = confirmationMsg
      .replace('{fecha}', dateDisplay)
      .replace('{hora}', timeSlotConfig)
      .replace('{direccion}', address);

    return {
      step: 'completed',
      message: confirmationMsg,
      data: appointment
    };
  }

  /**
   * Notificar al agente por WhatsApp usando template
   * Usa configuración dinámica desde bot_config (Settings) - solo teléfono
   */
  private async notifyAgent(appointment: any, visitorPhone: string): Promise<void> {
    // Obtener teléfono dinámico desde bot_config (Settings)
    const advisorPhone = await configRepository.get('advisor_phone', '');
    
    if (!advisorPhone) {
      console.error('❌ No hay teléfono de asesor configurado en Settings');
      throw new Error('advisor_phone no configurado en bot_config');
    }
    
    const timeSlotDisplay = await this.getTimeSlotDisplay(appointment.time_slot);
    const dateDisplay = this.formatDate(appointment.requested_date);

    // Limpiar el teléfono para el link de WhatsApp
    const cleanPhone = visitorPhone.replace(/\D/g, '');
    const whatsappLink = `https://wa.me/${cleanPhone}`;

    // Enviar usando template de WhatsApp
    await whatsappSender.sendTemplateMessage({
      to: advisorPhone,
      templateName: 'appointment_notification',
      languageCode: 'es_MX',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Asesor' }, // Nombre genérico fijo
            { type: 'text', text: appointment.visitor_name },
            { type: 'text', text: dateDisplay },
            { type: 'text', text: timeSlotDisplay },
            { type: 'text', text: whatsappLink }
          ]
        }
      ]
    });

    await appointmentRepository.markAgentNotified(appointment.id);
    
    console.log(`✅ Asesor notificado vía template: ${advisorPhone}`);
  }

  /**
   * Parsear fecha en español (con regex para "25 de octubre")
   * Intenta múltiples estrategias para ser tolerante con errores del usuario
   * PRIORIDAD: palabras clave (hoy/mañana) > día semana > fecha explícita
   */
  private parseDate(input: string): string | null {
    const normalized = input.toLowerCase().trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Resetear horas

    // PRIORIDAD 1: Hoy (buscar en cualquier parte del texto)
    if (normalized.includes('hoy')) {
      return today.toISOString().split('T')[0];
    }

    // PRIORIDAD 2: Mañana (buscar en cualquier parte del texto)
    if (normalized.includes('mañana') || normalized.includes('manana')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }

    // Días de la semana
    const daysMap: Record<string, number> = {
      'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
      'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6
    };

    // ESTRATEGIA 1: Solo día de semana (más común y seguro)
    // Buscar solo nombre de día sin números
    const hasNumber = /\d/.test(normalized);
    if (!hasNumber) {
      for (const [day, targetDay] of Object.entries(daysMap)) {
        if (normalized.includes(day)) {
          const result = new Date(today);
          const currentDay = result.getDay();
          const diff = (targetDay + 7 - currentDay) % 7 || 7;
          result.setDate(result.getDate() + diff);
          return result.toISOString().split('T')[0];
        }
      }
    }

    // ESTRATEGIA 2: Fecha explícita con número: "25 de octubre", "15 noviembre", "viernes 15 de noviembre"
    // Regex mejorado para capturar el mes correctamente (no "de")
    const dateRegex = /(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i;
    const match = input.match(dateRegex);
    
    if (match) {
      const day = parseInt(match[1]);
      const monthName = match[2].toLowerCase();
      
      const monthsMap: Record<string, number> = {
        'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
        'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
        'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
      };
      
      const month = monthsMap[monthName];
      
      if (month !== undefined && day >= 1 && day <= 31) {
        const year = today.getFullYear();
        const date = new Date(year, month, day);
        
        // Validar que la fecha sea válida (no sea fecha imposible como 31 feb)
        if (date.getDate() !== day || date.getMonth() !== month) {
          return null; // Fecha inválida (ej: 31 de febrero)
        }
        
        // NUNCA permitir fechas pasadas - retornar null para que muestre error
        if (date < today) {
          return null; // Fecha ya pasó
        }
        
        // VALIDACIÓN: Si el usuario especificó un día de la semana, verificar que coincida
        // Ejemplo: "viernes 15 de noviembre" -> verificar que 15 de noviembre sea viernes
        for (const [dayName, targetDayOfWeek] of Object.entries(daysMap)) {
          if (normalized.includes(dayName)) {
            const actualDayOfWeek = date.getDay();
            
            if (actualDayOfWeek !== targetDayOfWeek) {
              // El día de la semana NO coincide con la fecha
              console.log(`⚠️ Conflicto: Usuario dijo "${dayName}" pero ${day} de ${monthName} es día ${actualDayOfWeek}`);
              return null; // Día no coincide con la fecha
            }
            
            // Coincide, todo bien
            break;
          }
        }
        
        return date.toISOString().split('T')[0];
      }
    }

    // ESTRATEGIA 3: Solo número (interpretar como día del mes actual/siguiente)
    const dayOnlyMatch = normalized.match(/^(\d{1,2})$/);
    if (dayOnlyMatch) {
      const day = parseInt(dayOnlyMatch[1]);
      if (day >= 1 && day <= 31) {
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        // Intentar en el mes actual
        let date = new Date(currentYear, currentMonth, day);
        
        // Si es válido y no pasó, usarlo
        if (date.getDate() === day && date >= today) {
          return date.toISOString().split('T')[0];
        }
        
        // Intentar en el próximo mes
        date = new Date(currentYear, currentMonth + 1, day);
        if (date.getDate() === day) {
          return date.toISOString().split('T')[0];
        }
      }
    }

    return null;
  }

  /**
   * Parsear horario
   */
  private parseTimeSlot(input: string): TimeSlot | null {
    const normalized = input.toLowerCase().trim();

    // Detectar IDs de botones directamente
    if (normalized === 'morning') return 'morning';
    if (normalized === 'afternoon') return 'afternoon';
    if (normalized === 'evening') return 'evening';

    // Fallback a detección por texto
    if (normalized.includes('mañana') || normalized.includes('manana')) {
      return 'morning';
    }
    if (normalized.includes('mediodia') || normalized.includes('mediodía') || normalized.includes('medio')) {
      return 'afternoon';
    }
    if (normalized.includes('tarde') || normalized.includes('noche')) {
      return 'evening';
    }

    return null;
  }

  /**
   * Obtener display de time slot
   */
  private async getTimeSlotDisplay(slot: TimeSlot): Promise<string> {
    const slots = await appointmentRepository.getTimeSlots();
    const config = slots.find(s => s.time_slot === slot);
    return config 
      ? `${config.display_name} (${config.start_time} - ${config.end_time})`
      : slot;
  }

  /**
   * Formatear fecha para display
   */
  private formatDate(isoDate: string): string {
    const date = new Date(isoDate + 'T00:00:00'); // Asegurar timezone correcto
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === tomorrow.toDateString()) return 'Mañana';

    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    
    return date.toLocaleDateString('es-MX', options);
  }

  /**
   * Verificar si usuario tiene flujo activo de cita
   * pending_auto_offer no cuenta como flujo activo - se maneja en message-processor
   */
  async hasActiveFlow(userId: string): Promise<boolean> {
    const state = await userRepository.getAppointmentFlowState(userId);
    return state !== null && state !== 'completed' && state !== 'pending_auto_offer';
  }
}

export const appointmentManager = new AppointmentManager();
