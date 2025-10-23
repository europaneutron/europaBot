# Plan de Implementación: Sistema de Citas

**Fecha:** 22 de octubre de 2025  
**Estado:** En desarrollo  
**Prioridad:** Alta (MVP Core)  
**Tiempo estimado:** 2-3 horas

---

## 🎯 Objetivo

Implementar sistema de agendamiento de citas conversacional que:
1. Se ofrece automáticamente cuando usuario completa 4+ checkpoints
2. Puede ser solicitado manualmente con intent "cita"/"visita"/"agendar"
3. Maneja 3 horarios configurables del día
4. Pide datos mínimos (nombre)
5. Notifica al agente de ventas por WhatsApp

---

## 📋 Flujo de Conversación

```
Trigger: 4+ checkpoints completados o intent "cita"
    ↓
BOT: "¿Te gustaría agendar una visita?"
    ↓
USUARIO: "Sí" / "Claro" / "Me interesa"
    ↓
BOT: "Perfecto 📅 ¿Qué día prefieres visitarnos?
      Escribe el día, por ejemplo: 'mañana', 'hoy', 'lunes', '25 de octubre'"
    ↓
USUARIO: "Mañana"
    ↓
BOT: "Excelente. ¿En qué horario te acomoda mejor?
      
      🌅 Mañana (9:00 - 11:00 AM)
      ☀️ Mediodía (12:00 - 3:00 PM)
      🌆 Tarde (4:00 - 7:00 PM)
      
      Escribe: 'mañana', 'mediodia' o 'tarde'"
    ↓
USUARIO: "Tarde"
    ↓
BOT: "¡Perfecto! Solo necesito tu nombre completo para confirmar la cita."
    ↓
USUARIO: "Juan Pérez"
    ↓
BOT: "¡Listo Juan! 🎉
      
      Tu visita está agendada para:
      📅 Fecha: Mañana (23 de octubre)
      🕐 Horario: 4:00 - 7:00 PM
      
      Uno de nuestros asesores te contactará pronto para confirmar.
      ¿Hay algo más en lo que pueda ayudarte?"
    ↓
NOTIFICACIÓN AL AGENTE (WhatsApp):
"Hola Agente de Europa 👋

*Juan Pérez* está interesado en una visita al fraccionamiento.

📅 Fecha solicitada: Mañana (23 de octubre)
🕐 Horario: 4:00 - 7:00 PM

Puedes comunicarte con él al: https://wa.me/521234567890

¡Que tengas un excelente día!"
```

---

## 🗄️ Estructura de Base de Datos

### Tabla `appointments` (ya existe)
```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) NOT NULL,
  
  -- Datos de la cita
  visitor_name VARCHAR(255) NOT NULL,
  requested_date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL CHECK (time_slot IN ('morning', 'afternoon', 'evening')),
  
  -- Estado
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  
  -- Agente asignado
  assigned_agent_id UUID REFERENCES users(id),
  agent_notified_at TIMESTAMPTZ,
  
  -- Notas
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX idx_appointments_user ON appointments(user_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_date ON appointments(requested_date);
```

### Nueva tabla: `appointment_config` (configuración)
```sql
CREATE TABLE appointment_config (
  id SERIAL PRIMARY KEY,
  
  -- Horarios configurables
  time_slot VARCHAR(20) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  emoji VARCHAR(10),
  is_active BOOLEAN DEFAULT true,
  
  -- Orden de visualización
  display_order INTEGER,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Datos iniciales
INSERT INTO appointment_config (time_slot, display_name, start_time, end_time, emoji, display_order) VALUES
  ('morning', 'Mañana', '09:00', '11:00', '🌅', 1),
  ('afternoon', 'Mediodía', '12:00', '15:00', '☀️', 2),
  ('evening', 'Tarde', '16:00', '19:00', '🌆', 3);
```

### Nueva tabla: `agent_config` (configuración de agentes)
```sql
CREATE TABLE agent_config (
  id SERIAL PRIMARY KEY,
  
  -- Agente por defecto
  default_agent_phone VARCHAR(20) NOT NULL,
  default_agent_name VARCHAR(255) NOT NULL,
  
  -- Notificaciones
  notification_template TEXT,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agente por defecto (cambiar según tu caso)
INSERT INTO agent_config (default_agent_phone, default_agent_name, notification_template) VALUES
  ('+525512345678', 'Agente Europa', 
   'Hola {agent_name} 👋\n\n*{visitor_name}* está interesado en una visita al fraccionamiento.\n\n📅 Fecha solicitada: {date}\n🕐 Horario: {time_slot}\n\nPuedes comunicarte con él al: {whatsapp_link}\n\n¡Que tengas un excelente día!');
```

---

## 🔧 Arquitectura de Código

### 1. Tipos TypeScript

**Archivo:** `src/types/appointment.types.ts`

```typescript
export type TimeSlot = 'morning' | 'afternoon' | 'evening';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface AppointmentConfig {
  time_slot: TimeSlot;
  display_name: string;
  start_time: string; // "09:00"
  end_time: string;   // "11:00"
  emoji: string;
  display_order: number;
  is_active: boolean;
}

export interface AppointmentData {
  id: string;
  user_id: string;
  visitor_name: string;
  requested_date: string; // ISO date
  time_slot: TimeSlot;
  status: AppointmentStatus;
  created_at: string;
}

export interface AppointmentFlow {
  step: 'ask_confirmation' | 'ask_date' | 'ask_time' | 'ask_name' | 'completed';
  message: string;
  data?: Partial<AppointmentData>;
}

export interface AgentNotification {
  agent_phone: string;
  agent_name: string;
  visitor_name: string;
  visitor_phone: string;
  requested_date: string;
  time_slot: string;
  time_slot_display: string;
}
```

---

### 2. Repository Layer

**Archivo:** `src/data/repositories/appointment.repository.ts`

```typescript
import { supabaseServer } from '@/services/supabase/server-client';
import type { AppointmentData, AppointmentConfig, TimeSlot } from '@/types/appointment.types';

export class AppointmentRepository {
  /**
   * Obtener configuración de horarios
   */
  async getTimeSlots(): Promise<AppointmentConfig[]> {
    const { data, error } = await supabaseServer
      .from('appointment_config')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Crear nueva cita
   */
  async create(appointmentData: {
    user_id: string;
    visitor_name: string;
    requested_date: string;
    time_slot: TimeSlot;
  }): Promise<AppointmentData> {
    const { data, error } = await supabaseServer
      .from('appointments')
      .insert({
        ...appointmentData,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Marcar como notificado al agente
   */
  async markAgentNotified(appointmentId: string): Promise<void> {
    await supabaseServer
      .from('appointments')
      .update({ agent_notified_at: new Date().toISOString() })
      .eq('id', appointmentId);
  }

  /**
   * Obtener agente por defecto
   */
  async getDefaultAgent(): Promise<{ phone: string; name: string; template: string }> {
    const { data, error } = await supabaseServer
      .from('agent_config')
      .select('default_agent_phone, default_agent_name, notification_template')
      .eq('is_active', true)
      .single();

    if (error || !data) {
      // Fallback hardcoded
      return {
        phone: '+525512345678',
        name: 'Agente Europa',
        template: 'Hola {agent_name} 👋\n\n*{visitor_name}* está interesado en una visita al fraccionamiento.\n\n📅 Fecha solicitada: {date}\n🕐 Horario: {time_slot}\n\nPuedes comunicarte con él al: {whatsapp_link}\n\n¡Que tengas un excelente día!'
      };
    }

    return {
      phone: data.default_agent_phone,
      name: data.default_agent_name,
      template: data.notification_template
    };
  }
}

export const appointmentRepository = new AppointmentRepository();
```

---

### 3. Core - Appointment Manager

**Archivo:** `src/core/appointment/appointment-manager.ts`

```typescript
import { appointmentRepository } from '@/data/repositories/appointment.repository';
import { userRepository } from '@/data/repositories/user.repository';
import { whatsappSender } from '@/services/whatsapp/message-sender';
import type { AppointmentFlow, TimeSlot } from '@/types/appointment.types';

export class AppointmentManager {
  /**
   * Iniciar flujo de agendamiento
   */
  async startFlow(userId: string): Promise<AppointmentFlow> {
    // Guardar que iniciamos el flujo
    await this.saveFlowState(userId, 'ask_confirmation');

    return {
      step: 'ask_confirmation',
      message: '📅 ¿Te gustaría agendar una visita al fraccionamiento Europa?'
    };
  }

  /**
   * Procesar confirmación inicial
   */
  async processConfirmation(userId: string, input: string): Promise<AppointmentFlow> {
    const normalized = input.toLowerCase().trim();
    const positiveResponses = ['si', 'sí', 'claro', 'ok', 'dale', 'yes', 'por favor', 'me interesa'];

    if (positiveResponses.some(r => normalized.includes(r))) {
      await this.saveFlowState(userId, 'ask_date');
      
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
      await this.clearFlowState(userId);
      
      return {
        step: 'completed',
        message: 'Entendido. Cuando quieras agendar una visita, solo dímelo. ¿En qué más puedo ayudarte?'
      };
    }
  }

  /**
   * Procesar fecha
   */
  async processDate(userId: string, input: string): Promise<AppointmentFlow> {
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
    await this.saveFlowData(userId, { requested_date: parsedDate });
    await this.saveFlowState(userId, 'ask_time');

    // Obtener horarios configurados
    const timeSlots = await appointmentRepository.getTimeSlots();
    const slotsText = timeSlots
      .map(slot => `${slot.emoji} ${slot.display_name} (${slot.start_time} - ${slot.end_time})`)
      .join('\n');

    return {
      step: 'ask_time',
      message: `Excelente. ¿En qué horario te acomoda mejor?\n\n${slotsText}\n\n` +
               `Escribe: 'mañana', 'mediodia' o 'tarde'`
    };
  }

  /**
   * Procesar horario
   */
  async processTimeSlot(userId: string, input: string): Promise<AppointmentFlow> {
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
    await this.saveFlowData(userId, { time_slot: timeSlot });
    await this.saveFlowState(userId, 'ask_name');

    return {
      step: 'ask_name',
      message: '¡Perfecto! Solo necesito tu nombre completo para confirmar la cita.'
    };
  }

  /**
   * Procesar nombre y completar cita
   */
  async processName(userId: string, name: string): Promise<AppointmentFlow> {
    // Obtener datos temporales
    const flowData = await this.getFlowData(userId);
    
    if (!flowData?.requested_date || !flowData?.time_slot) {
      // Error en el flujo, reiniciar
      await this.clearFlowState(userId);
      return {
        step: 'completed',
        message: 'Hubo un error. Por favor intenta agendar nuevamente.'
      };
    }

    // Crear cita en BD
    const appointment = await appointmentRepository.create({
      user_id: userId,
      visitor_name: name,
      requested_date: flowData.requested_date,
      time_slot: flowData.time_slot
    });

    // Obtener info del usuario
    const user = await userRepository.findById(userId);

    // Notificar al agente
    await this.notifyAgent(appointment, user.phone_number);

    // Limpiar estado del flujo
    await this.clearFlowState(userId);

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

    const message = agentConfig.template
      .replace('{agent_name}', agentConfig.name)
      .replace('{visitor_name}', appointment.visitor_name)
      .replace('{date}', dateDisplay)
      .replace('{time_slot}', timeSlotDisplay)
      .replace('{whatsapp_link}', `https://wa.me/${visitorPhone.replace('+', '')}`);

    await whatsappSender.sendTextMessage({
      to: agentConfig.phone,
      message
    });

    await appointmentRepository.markAgentNotified(appointment.id);
  }

  /**
   * Parsear fecha en español
   */
  private parseDate(input: string): string | null {
    const normalized = input.toLowerCase().trim();
    const today = new Date();

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

    // TODO: Parsear fechas como "25 de octubre"
    // Por ahora, null si no se entiende
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
    const date = new Date(isoDate);
    const today = new Date();
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

  // Estados temporales (usar tabla temporal o Redis en producción)
  private async saveFlowState(userId: string, step: string): Promise<void> {
    // Guardar en user_progress o tabla temporal
    await userRepository.updateAppointmentFlowState(userId, step);
  }

  private async saveFlowData(userId: string, data: any): Promise<void> {
    await userRepository.updateAppointmentFlowData(userId, data);
  }

  private async getFlowData(userId: string): Promise<any> {
    return await userRepository.getAppointmentFlowData(userId);
  }

  private async clearFlowState(userId: string): Promise<void> {
    await userRepository.clearAppointmentFlow(userId);
  }
}

export const appointmentManager = new AppointmentManager();
```

---

### 4. Intent para "cita"

**Agregar a:** `supabase/migrations/004_appointment_system.sql`

```sql
-- Intent para solicitar cita manualmente
INSERT INTO intent_configurations (
  intent_name,
  category,
  keywords,
  synonyms,
  common_typos,
  phrases,
  min_confidence_score,
  requires_context,
  is_active
) VALUES (
  'cita',
  'appointment',
  ARRAY['cita', 'visita', 'agendar', 'agenda', 'ver', 'conocer'],
  ARRAY['agendar visita', 'programar cita', 'reservar', 'tour'],
  ARRAY['sita', 'bisita', 'ajendar', 'ajenda'],
  ARRAY['quiero agendar', 'me gustaría visitar', 'puedo ir a ver', 'cuando puedo ir'],
  0.7,
  false,
  true
);

-- Respuesta para intent cita
INSERT INTO bot_responses (intent_name, response_key, message_text, order_priority, is_active)
VALUES (
  'cita',
  'main',
  '¡Excelente! Me encantará ayudarte a agendar tu visita. 📅',
  1,
  true
);
```

---

## ✅ Checklist de Implementación

- [ ] Crear migración 004_appointment_system.sql
- [ ] Aplicar migración a Supabase
- [ ] Crear tipos TypeScript (appointment.types.ts)
- [ ] Crear AppointmentRepository
- [ ] Crear AppointmentManager
- [ ] Agregar métodos de flujo a UserRepository
- [ ] Integrar con MessageProcessor
- [ ] Agregar intent "cita" a base de datos
- [ ] Probar flujo completo en interfaz de test
- [ ] Verificar notificación a agente
- [ ] Documentar configuración de agente

---

## 🚀 Próximos Pasos (Post-MVP)

1. **Integración con Google Calendar**
   - OAuth2 con Google
   - Crear eventos automáticamente
   - Sincronizar disponibilidad

2. **Recordatorios automáticos**
   - Cron job 24h antes
   - Cron job 1h antes
   - Mensaje de confirmación

3. **Múltiples agentes**
   - Asignación por zona
   - Round-robin
   - Disponibilidad por horario

4. **Cancelación/Reprogramación**
   - Intent para cancelar
   - Intent para cambiar fecha/hora
   - Notificar cambios al agente

---

**¿Comenzamos con la implementación?**
