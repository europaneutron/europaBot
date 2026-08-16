import {
  renderClientVocabulary,
  toClientVocabulary,
} from '@/core/onboarding/client-vocabulary';
import { clientBrandRepository } from '@/data/repositories/client-brand.repository';

export class ClientVocabularyService {
  async render(text: string): Promise<string> {
    const config = await clientBrandRepository.get();
    return renderClientVocabulary(text, toClientVocabulary(config));
  }
}

export const clientVocabularyService = new ClientVocabularyService();
