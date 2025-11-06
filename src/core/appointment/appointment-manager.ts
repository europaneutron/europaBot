/**
 * Appointment Manager
 * Lógica de negocio para el flujo de agendamiento de citas
 */

import { appointmentRepository } from '@/data/repositories/appointment.repository';
import { userRepository } from '@/data/repositories/user.repository';
import { leadScorer } from '@/core/scoring';
import { whatsappSender } from '@/services/whatsapp/message-sender';
import type { AppointmentFlow, TimeSlot, AppointmentFlowData } from '@/types/appointment.types';

export class AppointmentManager {
  /**
   * Iniciar flujo de agendamiento
   */
  async startFlow(userId: string): Promise<AppointmentFlow> {
    // Guardar que iniciamos el flujo
    await userRepository.updateAppointmentFlowState(userId, 'ask_confirmation');

    return {
      step: 'ask_confirmation',
      message: '📅 ¿Te gustaría agendar una visita al fraccionamiento Europa?'
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
      
      return {
        step: 'ask_date',
        message: '¡Perfecto! 📅 ¿Qué día prefieres visitarnos?\n\n' +
                 'Puedes escribir:\n' +
                 '• "Hoy"\n' +
                 '• "Mañana"\n' +
                 '• Un día de la semana: "Lunes", "Martes"\n' +
                 '• Una fecha: "25 de octubre"'
      };
    } else {
      await userRepository.clearAppointmentFlow(userId);
      
      return {
        step: 'completed',
        message: 'Entendido. Cuando quieras agendar una visita, solo dímelo. ¿En qué más puedo ayudarte?'
      };
    }
  }

  /**
   * Procesar fecha
   */
  private async processDate(userId: string, input: string): Promise<AppointmentFlow> {
    const parsedDate = this.parseDate(input);
    
    if (!parsedDate) {
      return {
        step: 'ask_date',
        message: '🤔 No pude entender esa fecha. Por favor intenta con:\n' +
                 '• "Hoy" o "Mañana"\n' +
                 '• "Lunes", "Martes", etc.\n' +
                 '• "25 de octubre"'
      };
    }

    // Guardar fecha en estado temporal
    await userRepository.updateAppointmentFlowData(userId, { requested_date: parsedDate });
    await userRepository.updateAppointmentFlowState(userId, 'ask_time');

    // Obtener horarios configurados
    const timeSlots = await appointmentRepository.getTimeSlots();
    const slotsText = timeSlots
      .map(slot => `${slot.emoji} ${slot.display_name} (${slot.start_time} - ${slot.end_time})`)
      .join('\n');

    return {
      step: 'ask_time',
      message: `Excelente. ¿En qué horario te acomoda mejor?\n\n${slotsText}\n\n` +
               `Escribe: 'mañana', 'mediodía' o 'tarde'`
    };
  }

  /**
   * Procesar horario
   */
  private async processTimeSlot(userId: string, input: string): Promise<AppointmentFlow> {
    const timeSlot = this.parseTimeSlot(input);
    
    if (!timeSlot) {
      return {
        step: 'ask_time',
        message: '🤔 No entendí ese horario. Por favor escribe:\n' +
                 '• "Mañana" (9:00 - 11:00)\n' +
                 '• "Mediodía" (12:00 - 3:00)\n' +
                 '• "Tarde" (4:00 - 7:00)'
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

    // Formatear mensaje de confirmación
    const timeSlotConfig = await this.getTimeSlotDisplay(flowData.time_slot);
    const dateDisplay = this.formatDate(flowData.requested_date);

    return {
      step: 'completed',
      message: `¡Listo ${name}! 🎉\n\n` +
               `Tu visita está agendada para:\n` +
               `📅 Fecha: ${dateDisplay}\n` +
               `🕐 Horario: ${timeSlotConfig}\n\n` +
               `Uno de nuestros asesores te contactará pronto para confirmar.\n\n` +
               `¿Hay algo más en lo que pueda ayudarte?`,
      data: appointment
    };
  }

  /**
   * Notificar al agente por WhatsApp
   */
  private async notifyAgent(appointment: any, visitorPhone: string): Promise<void> {
    const agentConfig = await appointmentRepository.getDefaultAgent();
    const timeSlotDisplay = await this.getTimeSlotDisplay(appointment.time_slot);
    const dateDisplay = this.formatDate(appointment.requested_date);

    // Limpiar el teléfono para el link de WhatsApp
    const cleanPhone = visitorPhone.replace(/\D/g, '');

    const message = agentConfig.template
      .replace('{agent_name}', agentConfig.name)
      .replace('{visitor_name}', appointment.visitor_name)
      .replace('{date}', dateDisplay)
      .replace('{time_slot}', timeSlotDisplay)
      .replace('{whatsapp_link}', `https://wa.me/${cleanPhone}`);

    await whatsappSender.sendTextMessage({
      to: agentConfig.phone,
      message
    });

    await appointmentRepository.markAgentNotified(appointment.id);
    
    console.log(`✅ Agente notificado: ${agentConfig.name} (${agentConfig.phone})`);
  }

  /**
   * Parsear fecha en español (con regex para "25 de octubre")
   */
  private parseDate(input: string): string | null {
    const normalized = input.toLowerCase().trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Resetear horas

    // Hoy
    if (normalized === 'hoy') {
      return today.toISOString().split('T')[0];
    }

    // Mañana
    if (normalized === 'mañana' || normalized === 'manana') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }

    // Días de la semana
    const daysMap: Record<string, number> = {
      'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
      'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6
    };

    for (const [day, targetDay] of Object.entries(daysMap)) {
      if (normalized.includes(day)) {
        const result = new Date(today);
        const currentDay = result.getDay();
        const diff = (targetDay + 7 - currentDay) % 7 || 7;
        result.setDate(result.getDate() + diff);
        return result.toISOString().split('T')[0];
      }
    }

    // Fechas explícitas: "25 de octubre" o "25 octubre"
    const dateRegex = /(\d{1,2})\s+(?:de\s+)?(\w+)/i;
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
        
        // Si la fecha ya pasó este año, usar el próximo año
        if (date < today) {
          date.setFullYear(year + 1);
        }
        
        return date.toISOString().split('T')[0];
      }
    }

    return null;
  }

  /**
   * Parsear horario
   */
  private parseTimeSlot(input: string): TimeSlot | null {
    const normalized = input.toLowerCase().trim();

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
   * Verificar si usuario tiene flujo activo
   */
  async hasActiveFlow(userId: string): Promise<boolean> {
    const state = await userRepository.getAppointmentFlowState(userId);
    return state !== null && state !== 'completed';
  }
}

export const appointmentManager = new AppointmentManager();
