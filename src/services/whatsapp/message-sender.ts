/**
 * WhatsApp Message Sender
 * Envía mensajes a través de WhatsApp Business API
 */

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const WHATSAPP_TOKEN = process.env.WHATSAPP_API_TOKEN!;

export interface SendMessageParams {
  to: string;
  message: string;
  previewUrl?: boolean;
}

export class WhatsAppMessageSender {
  /**
   * Enviar mensaje de texto
   */
  async sendTextMessage({ to, message, previewUrl = true }: SendMessageParams): Promise<{ messageId: string }> {
    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: {
          preview_url: previewUrl,
          body: message
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('WhatsApp API error:', error);
      throw new Error(`Failed to send WhatsApp message: ${response.status}`);
    }

    const data = await response.json();
    return {
      messageId: data.messages[0].id
    };
  }

  /**
   * Enviar mensaje con documento (PDF, imagen, etc)
   */
  async sendDocument(to: string, documentUrl: string, caption?: string): Promise<{ messageId: string }> {
    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'document',
        document: {
          link: documentUrl,
          caption: caption || ''
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send document: ${response.status}`);
    }

    const data = await response.json();
    return {
      messageId: data.messages[0].id
    };
  }

  /**
   * Marcar mensaje como leído
   */
  async markAsRead(messageId: string): Promise<void> {
    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;

    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      })
    });
  }
}

// Singleton
export const whatsappSender = new WhatsAppMessageSender();
