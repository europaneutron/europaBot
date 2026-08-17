'use client';

import { FormEvent, useMemo, useState } from 'react';
import { LoaderCircle, RotateCcw, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const SIMULATED_LEADS = [
  { phone: '529990000001', label: 'Lead simulado 1' },
  { phone: '529990000002', label: 'Lead simulado 2' },
  { phone: '529990000003', label: 'Lead simulado 3' },
];

interface Diagnostic {
  scopeId: string | null;
  scopeName: string | null;
  pendingQuestion: string | null;
}

interface FlowButton {
  id: string;
  title: string;
}

interface Turn {
  id: string;
  input: string;
  messages: string[];
  /**
   * Los botones que WhatsApp mostraria bajo el ultimo mensaje. Al tocarlos se
   * envia su `id`, que es exactamente lo que el webhook recibe de WhatsApp:
   * `extractMessage` convierte un `button_reply` en el id del boton, no en su
   * titulo. Aqui no se imita nada; se usa el mismo camino.
   */
  buttons: FlowButton[];
  intent: string | null;
  isFallback: boolean;
  diagnostic: Diagnostic;
}

async function readResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No fue posible procesar el mensaje');
  return body;
}

export function ConversationSimulator() {
  const [phoneNumber, setPhoneNumber] = useState(SIMULATED_LEADS[0].phone);
  const [referralAdId, setReferralAdId] = useState('');
  const [message, setMessage] = useState('');
  const [turnsByLead, setTurnsByLead] = useState<Record<string, Turn[]>>({});
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turns = useMemo(() => turnsByLead[phoneNumber] || [], [phoneNumber, turnsByLead]);
  // Solo el ultimo turno conserva botones activos: en WhatsApp los de un
  // mensaje anterior siguen visibles pero el flujo ya avanzo.
  const isLastTurn = (turn: Turn) => turns[turns.length - 1]?.id === turn.id;

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    await send(message.trim());
  }

  async function send(input: string) {
    if (!input || processing) return;
    setProcessing(true);
    setError(null);
    try {
      const body = await readResponse(await fetch('/api/test/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          message: input,
          referralAdId: turns.length === 0 && referralAdId.trim() ? referralAdId.trim() : undefined,
        }),
      }));
      const turn: Turn = {
        id: `${phoneNumber}-${Date.now()}`,
        input,
        messages: body.messages,
        buttons: body.buttons || [],
        intent: body.intent,
        isFallback: body.isFallback,
        diagnostic: body.diagnostic,
      };
      setTurnsByLead(current => ({
        ...current,
        [phoneNumber]: [...(current[phoneNumber] || []), turn],
      }));
      setMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible procesar el mensaje');
    } finally {
      setProcessing(false);
    }
  }

  async function resetLead() {
    setProcessing(true);
    setError(null);
    try {
      const response = await fetch('/api/test/reset-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      if (response.status !== 404) await readResponse(response);
      setTurnsByLead(current => ({ ...current, [phoneNumber]: [] }));
      setReferralAdId('');
      setMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible reiniciar el lead');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Simulador de conversación</h1>
        <p className="text-muted-foreground">Conversa con el procesador real sin enviar mensajes por WhatsApp.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Escenario</CardTitle>
          <CardDescription>El anuncio solo se aplica al primer mensaje después de reiniciar.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label>Lead de prueba</Label>
            <Select value={phoneNumber} onValueChange={setPhoneNumber} disabled={processing}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIMULATED_LEADS.map(lead => <SelectItem key={lead.phone} value={lead.phone}>{lead.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="referral-ad">Identificador del anuncio, opcional</Label>
            <Input id="referral-ad" value={referralAdId} onChange={event => setReferralAdId(event.target.value)} disabled={processing || turns.length > 0} />
          </div>
          <Button type="button" variant="outline" onClick={resetLead} disabled={processing}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reiniciar
          </Button>
        </CardContent>
      </Card>

      <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        Los botones son los mismos que WhatsApp muestra y envían el mismo identificador al tocarlos. No se reproduce la latencia real de WhatsApp ni las pausas entre fragmentos.
      </div>

      <div className="space-y-4" aria-live="polite">
        {turns.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Escribe el primer mensaje para iniciar la conversación.</CardContent></Card>
        ) : null}
        {turns.map(turn => (
          <div key={turn.id} className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground whitespace-pre-wrap">{turn.input}</div>
                {turn.messages.map((item, index) => (
                  <div key={`${turn.id}-${index}`} className="space-y-2">
                    <div className={cn(
                      'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border px-4 py-3',
                      turn.isFallback && 'border-destructive/50 bg-destructive/5'
                    )}>{item}</div>
                    {index === turn.messages.length - 1 && turn.buttons.length > 0 ? (
                      <div className="flex max-w-[85%] flex-wrap gap-2">
                        {turn.buttons.map(button => (
                          <Button
                            key={button.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={processing || !isLastTurn(turn)}
                            onClick={() => void send(button.id)}
                          >
                            {button.title}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="self-start">
              <CardHeader className="pb-3"><CardTitle className="text-base">Diagnóstico del turno</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <DiagnosticRow label="Alcance" value={turn.diagnostic.scopeName || 'Sin foco'} />
                <DiagnosticRow label="Intención" value={turn.intent || 'No detectada'} />
                <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Fallback</span><Badge variant={turn.isFallback ? 'destructive' : 'secondary'}>{turn.isFallback ? 'Sí' : 'No'}</Badge></div>
                <DiagnosticRow label="Pregunta pendiente" value={turn.diagnostic.pendingQuestion || 'Ninguna'} />
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage} className="sticky bottom-16 space-y-2 rounded-lg border bg-background p-3 shadow-lg md:bottom-4">
        <Label htmlFor="simulator-message">Mensaje del lead</Label>
        <div className="flex gap-2">
          <Textarea id="simulator-message" value={message} onChange={event => setMessage(event.target.value)} disabled={processing} className="min-h-20" placeholder="Escribe como lo haría un lead" />
          <Button type="submit" disabled={processing || !message.trim()} className="self-end">
            {processing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {processing ? 'Procesando' : 'Enviar'}
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </form>
    </div>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
