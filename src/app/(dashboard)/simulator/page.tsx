import { notFound } from 'next/navigation';
import { ConversationSimulator } from '@/components/admin/ConversationSimulator';

export default function SimulatorPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ConversationSimulator />;
}
