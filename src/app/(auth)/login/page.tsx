/**
 * Pagina de Login
 * Autenticacion con Supabase Auth + Rate Limiting
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle, Lock } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { success, error: signInError, isLocked: locked } = await signIn(email, password);

    if (success) {
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get('redirectedFrom') || '/dashboard';
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      router.refresh();
      router.push(redirectTo);
    } else {
      setError(signInError || 'Error al iniciar sesion');
      setIsLocked(locked || false);
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-3xl font-bold">Europa Bot</CardTitle>
        <CardDescription>Panel Administrativo</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@europa.com"
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">Contrasena</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
              isLocked 
                ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' 
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {isLocked ? (
                <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className="font-medium">{error}</p>
                {isLocked && (
                  <p className="text-xs mt-1 opacity-75">
                    Por seguridad, la cuenta ha sido bloqueada temporalmente.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Submit button */}
          <Button
            type="submit"
            disabled={loading || isLocked}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando sesion...
              </>
            ) : (
              'Iniciar Sesion'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
