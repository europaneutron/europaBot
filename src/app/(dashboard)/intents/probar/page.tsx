/**
 * Probador de frases.
 *
 * Pegas las formas reales en que la gente pregunta, una por línea, y te dice
 * cuáles no reconoce. Es lo que convierte "el matcher es frágil" en "el
 * matcher se arregla en diez minutos": las que salen en rojo se copian a los
 * sinónimos de su pregunta y se vuelve a correr.
 *
 * Corre el mismo matcher que atiende el webhook. No contesta ni guarda nada.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Play, CheckCircle2, AlertCircle } from 'lucide-react';

interface PhraseResult {
  phrase: string;
  detected: boolean;
  intentName: string | null;
  confidence: number | null;
  method: string | null;
  runnerUp: { intentName: string; confidence: number } | null;
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
};

const EXAMPLE = [
  'cuanto cuesta',
  'cuánto sale el lote',
  'donde estan ubicados',
  'me pasas la ubicación',
  'aceptan infonavit',
  'quiero agendar una visita',
].join('\n');

export default function TryPhrasesPage() {
  const { data: scopeData } = useSWR('/api/scopes', fetcher);
  const [scopeId, setScopeId] = useState<string>('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PhraseResult[] | null>(null);

  const rootScopeId: string = scopeData?.rootScopeId || '';
  const selectableScopes = ((scopeData?.scopes || []) as any[])
    .filter(scope => scope.is_active)
    .filter(scope => !scope.parent_id || scope.parent_id === rootScopeId);
  const effectiveScopeId = scopeId || rootScopeId;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/intents/try-phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phrases: text.split('\n').map(line => line.trim()).filter(Boolean),
          scopeId: effectiveScopeId || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setResults(body.results);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible probar las frases');
    } finally {
      setBusy(false);
    }
  }

  const missed = (results || []).filter(result => !result.detected);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Probador de frases</h1>
        <p className="text-muted-foreground mt-1">
          Pega cómo pregunta la gente de verdad, una por línea. Te digo cuáles no entiende el bot.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1">
            <Label htmlFor="scope">Como si el lead estuviera preguntando por</Label>
            <Select value={effectiveScopeId} onValueChange={setScopeId}>
              <SelectTrigger id="scope" className="max-w-sm"><SelectValue placeholder="Elige el alcance" /></SelectTrigger>
              <SelectContent>
                {selectableScopes.map(scope => (
                  <SelectItem key={scope.id} value={scope.id}>{scope.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="phrases">Frases, una por línea</Label>
            <Textarea
              id="phrases"
              value={text}
              onChange={event => setText(event.target.value)}
              className="min-h-48 font-mono text-sm"
              placeholder={EXAMPLE}
              disabled={busy}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button disabled={busy || !text.trim()} onClick={run}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Probar
            </Button>
            {!text.trim() ? (
              <Button variant="ghost" onClick={() => setText(EXAMPLE)}>Usar el ejemplo</Button>
            ) : null}
          </div>

          {error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
        </CardContent>
      </Card>

      {results ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {missed.length === 0
                ? `Las ${results.length} se entienden`
                : `${missed.length} de ${results.length} no se entienden`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.map((result, index) => (
              <div
                key={`${result.phrase}-${index}`}
                className={`flex items-start justify-between gap-4 rounded-md border p-3 text-sm ${
                  result.detected ? '' : 'border-destructive/40 bg-destructive/5'
                }`}
              >
                <div className="flex items-start gap-2">
                  {result.detected
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                  <div>
                    <div>{result.phrase}</div>
                    {result.detected ? null : (
                      <div className="text-muted-foreground">
                        No engancha con ninguna pregunta.
                        {result.runnerUp
                          ? ` La más cercana fue ${result.runnerUp.intentName}, y se quedó corta.`
                          : ''}
                      </div>
                    )}
                  </div>
                </div>
                {result.detected && result.intentName ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{result.confidence}</Badge>
                    <Link href={`/intents/q/${encodeURIComponent(result.intentName)}`} className="text-primary hover:underline">
                      {result.intentName}
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}

            {missed.length > 0 ? (
              <div className="rounded-md bg-muted p-3 text-sm">
                <div className="font-medium">Cómo se arregla</div>
                <p className="mt-1 text-muted-foreground">
                  Abre la pregunta que debería haber contestado, entra a editar su vocabulario y
                  agrega la frase en <strong>sinónimos</strong> o en <strong>frases</strong>. Vuelve
                  aquí y prueba otra vez.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
