/**
 * La identidad del negocio: cómo se llama, cómo llama a sus proyectos, cómo
 * habla y cómo saluda.
 *
 * Vivía solo dentro del recorrido guiado, que es parte del compilador. Con el
 * bot configurado a mano se quedaba sin sitio, y no es un detalle: el nombre
 * del negocio y las palabras "desarrollo / desarrollos" salen en los mensajes
 * del sistema como {business_name} y {project_singular}.
 */

'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';

const TONES = [
  { value: 'friendly', label: 'Cercano' },
  { value: 'direct', label: 'Directo' },
  { value: 'formal', label: 'Formal' },
];

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No fue posible cargar la identidad del negocio');
  return response.json();
};

export function BrandSection() {
  const { data, mutate } = useSWR('/api/client-brand', fetcher);
  const [businessName, setBusinessName] = useState('');
  const [singular, setSingular] = useState('');
  const [plural, setPlural] = useState('');
  const [tone, setTone] = useState('friendly');
  const [composedGreeting, setComposedGreeting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.brand) return;
    setBusinessName(data.brand.business_name || '');
    setSingular(data.vocabulary?.singular || '');
    setPlural(data.vocabulary?.plural || '');
    setTone(data.brand.tone || 'friendly');
    setComposedGreeting(Boolean(data.brand.use_composed_greeting));
  }, [data]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/client-brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          projectSingular: singular,
          projectPlural: plural,
          tone,
          useComposedGreeting: composedGreeting,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await mutate();
      setMessage('Guardado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>El negocio</CardTitle>
        <CardDescription>
          Cómo se llama, cómo llama a sus proyectos y cómo habla. Estas palabras salen en los
          mensajes del bot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="business-name">Nombre del negocio</Label>
          <Input
            id="business-name"
            value={businessName}
            onChange={event => setBusinessName(event.target.value)}
            placeholder="Inmobiliaria FYMSA"
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            Es lo que sale como <code>{'{business_name}'}</code> y en el saludo.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="singular">Cómo llamas a uno</Label>
            <Input
              id="singular"
              value={singular}
              onChange={event => setSingular(event.target.value)}
              placeholder="fraccionamiento"
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plural">Y a varios</Label>
            <Input
              id="plural"
              value={plural}
              onChange={event => setPlural(event.target.value)}
              placeholder="fraccionamientos"
              disabled={saving}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Salen como <code>{'{project_singular}'}</code> y <code>{'{project_plural}'}</code>.
        </p>

        <div className="space-y-2">
          <Label htmlFor="tone">Cómo habla</Label>
          <Select value={tone} onValueChange={setTone} disabled={saving}>
            <SelectTrigger id="tone" className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TONES.map(item => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-start gap-2 rounded-md border p-3">
          <Checkbox
            id="composed-greeting"
            checked={composedGreeting}
            onCheckedChange={(checked: boolean) => setComposedGreeting(checked)}
            disabled={saving}
          />
          <div className="space-y-1">
            <Label htmlFor="composed-greeting">Saludo automático</Label>
            <p className="text-xs text-muted-foreground">
              El bot arma el saludo con el nombre del negocio y la lista de {plural || 'proyectos'},
              y se actualiza solo cuando das de alta uno nuevo. Si lo apagas, el saludo es la
              respuesta que escribas en la pregunta <strong>saludo</strong>, más el mensaje
              &quot;Saludo: lista de {plural || 'proyectos'}&quot; de esta misma pantalla.
            </p>
          </div>
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !businessName.trim() || !singular.trim() || !plural.trim()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
