/**
 * Custom hook para manejar la configuración del bot
 */

import { useState, useEffect, useCallback } from 'react';
import { configRepositoryClient, BotConfig } from '@/data/repositories/config.repository.client';
import { ConfigsByCategory, MessageState } from '../types';

export function useSettingsConfig() {
  const [configs, setConfigs] = useState<ConfigsByCategory>({
    appointments: [],
    scoring: [],
    fallback: [],
    contact: [],
    messages: [],
    system_messages: [],
    fallback_messages: [],
    appointment_messages: [],
    derivation_messages: [],
    followup: [],
    ai: []
  });
  
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<MessageState | null>(null);

  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const allConfigs = await configRepositoryClient.getAll();
      
      const grouped: ConfigsByCategory = {
        appointments: allConfigs.filter((c: BotConfig) => c.category === 'appointments'),
        scoring: allConfigs.filter((c: BotConfig) => c.category === 'scoring'),
        fallback: allConfigs.filter((c: BotConfig) => c.category === 'fallback'),
        contact: allConfigs.filter((c: BotConfig) => c.category === 'contact'),
        messages: allConfigs.filter((c: BotConfig) => c.category === 'messages'),
        system_messages: allConfigs.filter((c: BotConfig) => c.category === 'system_messages'),
        fallback_messages: allConfigs.filter((c: BotConfig) => c.category === 'fallback_messages'),
        appointment_messages: allConfigs.filter((c: BotConfig) => c.category === 'appointment_messages'),
        derivation_messages: allConfigs.filter((c: BotConfig) => c.category === 'derivation_messages'),
        followup: allConfigs.filter((c: BotConfig) => c.category === 'followup'),
        ai: allConfigs.filter((c: BotConfig) => c.category === 'ai')
      };
      
      setConfigs(grouped);
    } catch (error) {
      console.error('Error loading configs:', error);
      setMessage({ type: 'error', text: 'Error al cargar configuraciones' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const saveConfigs = useCallback(async (updates: Array<{ key: string; value: string }>) => {
    try {
      await configRepositoryClient.updateMultiple(updates);
      setMessage({ type: 'success', text: 'Configuraciones guardadas exitosamente' });
      await loadConfigs();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving configs:', error);
      setMessage({ type: 'error', text: 'Error al guardar configuraciones' });
      throw error;
    }
  }, [loadConfigs]);

  const getConfigValue = useCallback((configs: BotConfig[], key: string): string => {
    return configs.find(c => c.config_key === key)?.config_value || '';
  }, []);

  const isConfigChecked = useCallback((configs: BotConfig[], key: string): boolean => {
    return getConfigValue(configs, key) === 'true';
  }, [getConfigValue]);

  return {
    configs,
    loading,
    message,
    loadConfigs,
    saveConfigs,
    getConfigValue,
    isConfigChecked
  };
}
