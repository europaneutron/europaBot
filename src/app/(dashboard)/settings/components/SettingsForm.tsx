/**
 * Formulario principal de configuraciones generales
 * Agrupa todas las secciones de configuración
 */

import { CheckpointsSection } from './sections/CheckpointsSection';
import { ScoringSection } from './sections/ScoringSection';
import { FallbackSection } from './sections/FallbackSection';
import { ContactSection } from './sections/ContactSection';
import { MessagesSection } from './sections/MessagesSection';
import { ConfigsByCategory } from '../types';

interface Props {
  configs: ConfigsByCategory;
  onReload: () => Promise<void>;
}

export function SettingsForm({ configs, onReload }: Props) {
  return (
    <div className="contents">
      <CheckpointsSection configs={configs.appointments} onReload={onReload} />
      <ScoringSection configs={configs.scoring} onReload={onReload} />
      <FallbackSection configs={configs.fallback} onReload={onReload} />
      <ContactSection configs={configs.contact} onReload={onReload} />
      <MessagesSection configs={configs.messages} onReload={onReload} />
    </div>
  );
}
