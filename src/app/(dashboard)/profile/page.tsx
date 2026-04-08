/**
 * Pagina de perfil del administrador
 * Permite cambiar la contrasena
 */

'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { validatePassword } from '@/utils/password-validator';
import { Loader2, Save, Eye, EyeOff, UserCog } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!currentPassword.trim()) {
      setMessage({ type: 'error', text: 'Ingresa tu contrasena actual' });
      return;
    }

    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      setMessage({ type: 'error', text: 'La nueva contrasena no cumple los requisitos de seguridad' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Las contrasenas no coinciden' });
      return;
    }

    if (currentPassword === newPassword) {
      setMessage({ type: 'error', text: 'La nueva contrasena debe ser diferente a la actual' });
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Error al cambiar contrasena' });
        return;
      }

      setMessage({ type: 'success', text: 'Contrasena actualizada exitosamente' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error changing password:', error);
      setMessage({ type: 'error', text: 'Error de conexion' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <UserCog className="h-8 w-8" />
          Mi Perfil
        </h1>
        <p className="text-muted-foreground mt-1">
          Gestiona tu cuenta de administrador
        </p>
      </div>

      {/* Informacion de cuenta */}
      <Card>
        <CardHeader>
          <CardTitle>Cuenta</CardTitle>
          <CardDescription>Informacion de tu sesion actual</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-muted-foreground text-xs">Correo electronico</Label>
            <p className="font-medium">{user?.email || '—'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Cambiar contrasena */}
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contrasena</CardTitle>
          <CardDescription>
            Ingresa tu contrasena actual y la nueva contrasena
          </CardDescription>
        </CardHeader>
        <CardContent>
          {message && (
            <div className={`rounded-lg border p-4 mb-6 ${
              message.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-5">
            {/* Contrasena actual */}
            <div className="space-y-2">
              <Label htmlFor="current_password">Contrasena actual</Label>
              <div className="relative">
                <Input
                  id="current_password"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={saving}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCurrent(!showCurrent)}
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Nueva contrasena */}
            <div className="space-y-2">
              <Label htmlFor="new_password">Nueva contrasena</Label>
              <div className="relative">
                <Input
                  id="new_password"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={saving}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNew(!showNew)}
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrengthMeter password={newPassword} />
            </div>

            {/* Confirmar nueva contrasena */}
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirmar nueva contrasena</Label>
              <Input
                id="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={saving}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-600">Las contrasenas no coinciden</p>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={saving || !currentPassword || !newPassword || !confirmPassword}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cambiando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Cambiar contrasena
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
