/**
 * Página raíz - Redirige al dashboard
 * El middleware se encargará de verificar autenticación
 */

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/dashboard');
}
