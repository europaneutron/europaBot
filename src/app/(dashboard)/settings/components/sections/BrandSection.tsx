/**
 * La identidad del negocio: cómo se llama y cómo llama a sus proyectos.
 *
 * Vivía solo dentro del recorrido guiado, que es parte del compilador. Con el
 * bot configurado a mano se quedaba sin sitio, y no es un detalle: el nombre
 * del negocio y las palabras "desarrollo / desarrollos" salen en los mensajes
 * del sistema como {business_name} y {project_singular}.
 *
 * El tono no esta aqui a proposito: solo lo lee el prompt de redaccion del
 * compilador. Con los mensajes escritos a mano no cambia nada, y una opcion
 * que no hace nada confunde mas que ayudar. El saludo automatico se fue por
 * lo mismo y por algo peor: encendido, borraba la respuesta escrita para
 * `saludo` sin decirlo. Ahora saludar es una pregunta como las demas.
 */

'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.brand) return;
    setBusinessName(data.brand.business_name || '');
    setSingular(data.vocabulary?.singular || '');
    setPlural(data.vocabulary?.plural || '');
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
          Cómo se llama y cómo llama a sus proyectos. Estas palabras salen en los mensajes del
          bot. El saludo se escribe en la pregunta <strong>saludo</strong>, como cualquier otra.
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
            Es lo que sale como <code>{'{business_name}'}</code> en los mensajes del bot.
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
