/**
 * Webhook Validator
 * Valida firmas y verifica tokens de WhatsApp
 */

import crypto from 'crypto';

const APP_SECRET = (process.env.WHATSAPP_APP_SECRET || '').trim();
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && !APP_SECRET) {
  console.error('[SECURITY] WHATSAPP_APP_SECRET no esta configurado. La validacion de firma del webhook esta desactivada.');
}

export class WebhookValidator {
  /**
   * Validar firma de Meta (X-Hub-Signature-256)
   */
  validateSignature(payload: string | Buffer, signature: string | null): boolean {
    if (!APP_SECRET) {
      if (IS_PRODUCTION) {
        console.error('[SECURITY] Rechazando request: WHATSAPP_APP_SECRET no configurado en produccion');
        return false;
      }
      // Solo en desarrollo se permite omitir la validacion
      return true;
    }

    if (!signature) {
      return false;
    }

    // Meta envia: "sha256=<hex>" — extraer solo el hex
    const receivedHex = signature.startsWith('sha256=') ? signature.slice(7) : signature;

    const expectedHex = crypto
      .createHmac('sha256', APP_SECRET)
      .update(payload)
      .digest('hex');

    // Log de diagnostico temporal — remover una vez resuelto
    console.log('[HMAC] receivedHex (primeros 16):', receivedHex.slice(0, 16));
    console.log('[HMAC] expectedHex (primeros 16):', expectedHex.slice(0, 16));
    console.log('[HMAC] APP_SECRET length:', APP_SECRET.length);

    // Comparacion de tiempo constante para evitar timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedHex, 'hex'),
        Buffer.from(expectedHex, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Validar verify token (setup del webhook)
   */
  validateVerifyToken(token: string): boolean {
    return token === VERIFY_TOKEN;
  }

  /**
   * Extraer mensaje de texto o respuesta de botón del payload de WhatsApp
   */
  extractMessage(body: any): {
    from: string;
    messageId: string;
    text: string;
    name?: string;
  } | null {
    try {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      if (!message) {
        return null;
      }

      const contact = value?.contacts?.[0];
      let text: string;

      // Manejar mensajes de texto normales
      if (message.type === 'text') {
        text = message.text.body;
      } 
      // Manejar respuestas de botones interactivos
      else if (message.type === 'interactive') {
        if (message.interactive?.type === 'button_reply') {
          // Usuario presionó un botón, usar el ID del botón como texto
          text = message.interactive.button_reply.id;
        } else if (message.interactive?.type === 'list_reply') {
          // Usuario seleccionó de una lista
          text = message.interactive.list_reply.id;
        } else {
          return null;
        }
      } 
      else {
        // Tipo de mensaje no soportado
        return null;
      }

      return {
        from: message.from,
        messageId: message.id,
        text: text,
        name: contact?.profile?.name
      };
    } catch (error) {
      console.error('Error extracting message:', error);
      return null;
    }
  }

  /**
   * Verificar si es un mensaje válido de WhatsApp
   */
  isValidWhatsAppMessage(body: any): boolean {
    return (
      body.object === 'whatsapp_business_account' &&
      body.entry?.[0]?.changes?.[0]?.value?.messages?.length > 0
    );
  }
}

// Singleton
export const webhookValidator = new WebhookValidator();
