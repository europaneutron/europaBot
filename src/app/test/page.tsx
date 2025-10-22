/**
 * Página de Testing del Bot - Sin necesidad de WhatsApp
 * Simula conversaciones completas
 */

'use client';

import { useState } from 'react';

interface Message {
  id: string;
  direction: 'incoming' | 'outgoing';
  text: string;
  timestamp: Date;
  intent?: string;
  confidence?: number;
}

export default function BotTestingPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+521234567890');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      direction: 'incoming',
      text: inputText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      // Simular llamada al Message Processor
      const response = await fetch('/api/test/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          message: inputText,
          messageId: `test_${Date.now()}`
        })
      });

      const data = await response.json();

      // El API ahora devuelve un array de respuestas (responses)
      if (data.responses && Array.isArray(data.responses)) {
        // Procesar cada respuesta (puede ser string o fragmentada)
        const newMessages: Message[] = data.responses.map((resp: any, index: number) => {
          let text: string;
          
          if (typeof resp === 'string') {
            // Respuesta simple
            text = resp;
          } else if (resp.fragments) {
            // Respuesta fragmentada - convertir a texto para visualización
            text = resp.fragments
              .map((f: any) => {
                if (f.type === 'text') return f.content;
                return `[${f.type.toUpperCase()}: ${f.url || f.name || 'contenido'}]`;
              })
              .join('\n\n');
          } else {
            text = 'Error: formato de respuesta desconocido';
          }

          return {
            id: (Date.now() + index + 1).toString(),
            direction: 'outgoing' as const,
            text,
            timestamp: new Date(),
            intent: data.intent,
            confidence: data.confidence
          };
        });

        setMessages(prev => [...prev, ...newMessages]);
      } else {
        // Fallback si no hay respuestas
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          direction: 'outgoing',
          text: 'Error al procesar mensaje',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMessage]);
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        direction: 'outgoing',
        text: '❌ Error al procesar el mensaje',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickTests = [
    'Hola',
    'Cuanto cuesta?',
    'Donde esta ubicado?',
    'Que modelos hay?',
    'Aceptan credito?',
    'Es seguro?',
    'Tienes brochure?',
    'presio', // typo
    'mensaje random sin sentido'
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold mb-4">🤖 Bot Europa - Testing Local</h1>
          <p className="text-gray-600 mb-4">
            Prueba el bot sin necesidad de WhatsApp. Simula conversaciones completas.
          </p>
          
          {/* Configuración */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Número de teléfono (simulado):
            </label>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="+521234567890"
            />
          </div>

          {/* Tests rápidos */}
          <div className="mb-4">
            <p className="text-sm font-medium mb-2">Tests rápidos:</p>
            <div className="flex flex-wrap gap-2">
              {quickTests.map((test) => (
                <button
                  key={test}
                  onClick={() => {
                    setInputText(test);
                    setTimeout(() => sendMessage(), 100);
                  }}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200"
                >
                  {test}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Mensajes */}
          <div className="h-96 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-20">
                👆 Envía un mensaje para empezar a probar el bot
              </div>
            )}
            
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'incoming' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-4 py-2 rounded-lg ${
                    msg.direction === 'incoming'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white border border-gray-300'
                  }`}
                >
                  <p className="text-sm">{msg.text}</p>
                  {msg.intent && (
                    <p className="text-xs mt-1 opacity-70">
                      🎯 Intent: {msg.intent} ({(msg.confidence! * 100).toFixed(0)}%)
                    </p>
                  )}
                  <p className="text-xs mt-1 opacity-50">
                    {msg.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-300 px-4 py-2 rounded-lg">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t bg-white">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputText.trim()}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            💡 <strong>Nota:</strong> Este es un entorno de testing local. Los mensajes NO se envían a WhatsApp real.
            Prueba diferentes mensajes para ver cómo responde el bot.
          </p>
        </div>
      </div>
    </div>
  );
}
