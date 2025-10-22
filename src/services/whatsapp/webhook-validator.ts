/**
 * Webhook Validator
 * Valida firmas y verifica tokens de WhatsApp
 */

import crypto from 'crypto';

const APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!;

export class WebhookValidator {
  /**
   * Validar firma de Meta (X-Hub-Signature-256)
   */
  validateSignature(payload: string, signature: string | null): boolean {
    if (!signature || !APP_SECRET) {
      // Si no hay APP_SECRET configurado, saltamos validación (solo desarrollo)
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', APP_SECRET)
      .update(payload)
      .digest('hex');

    return signature === `sha256=${expectedSignature}`;
  }

  /**
   * Validar verify token (setup del webhook)
   */
  validateVerifyToken(token: string): boolean {
    return token === VERIFY_TOKEN;
  }

  /**
   * Extraer mensaje de texto del payload de WhatsApp
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

      if (!message || message.type !== 'text') {
        return null;
      }

      const contact = value?.contacts?.[0];

      return {
        from: message.from,
        messageId: message.id,
        text: message.text.body,
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
