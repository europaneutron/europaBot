/**
 * Types para la configuración del bot
 */

import { BotConfig } from '@/data/repositories/config.repository.client';

export interface ConfigsByCategory {
  appointments: BotConfig[];
  scoring: BotConfig[];
  fallback: BotConfig[];
  contact: BotConfig[];
  messages: BotConfig[];
  system_messages: BotConfig[];
  fallback_messages: BotConfig[];
  appointment_messages: BotConfig[];
  derivation_messages: BotConfig[];
  followup: BotConfig[];
}

export interface MessageState {
  type: 'success' | 'error';
  text: string;
}

export interface SectionProps {
  configs: BotConfig[];
  onSave: (updates: Array<{ key: string; value: string }>) => Promise<void>;
  getConfigValue: (configs: BotConfig[], key: string) => string;
  isConfigChecked: (configs: BotConfig[], key: string) => boolean;
}
