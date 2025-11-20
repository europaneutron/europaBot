/**
 * Página para Editar una Intención existente
 */

import IntentForm from '@/components/intents/IntentForm';

export default function EditIntentPage({ params }: { params: { intentId: string } }) {
  return <IntentForm mode="edit" intentId={params.intentId} />;
}
