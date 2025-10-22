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

  /**
   * Enviar imagen
   */
  async sendImage(to: string, imageUrl: string, caption?: string): Promise<{ messageId: string }> {
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
        type: 'image',
        image: {
          link: imageUrl,
          caption: caption || ''
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send image: ${response.status}`);
    }

    const data = await response.json();
    return {
      messageId: data.messages[0].id
    };
  }

  /**
   * Enviar video
   */
  async sendVideo(to: string, videoUrl: string, caption?: string): Promise<{ messageId: string }> {
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
        type: 'video',
        video: {
          link: videoUrl,
          caption: caption || ''
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send video: ${response.status}`);
    }

    const data = await response.json();
    return {
      messageId: data.messages[0].id
    };
  }

  /**
   * Enviar ubicación
   */
  async sendLocation(
    to: string, 
    latitude: number, 
    longitude: number, 
    name: string, 
    address: string
  ): Promise<{ messageId: string }> {
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
        type: 'location',
        location: {
          latitude: latitude,
          longitude: longitude,
          name: name,
          address: address
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send location: ${response.status}`);
    }

    const data = await response.json();
    return {
      messageId: data.messages[0].id
    };
  }

  /**
   * Enviar audio
   */
  async sendAudio(to: string, audioUrl: string): Promise<{ messageId: string }> {
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
        type: 'audio',
        audio: {
          link: audioUrl
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send audio: ${response.status}`);
    }

    const data = await response.json();
    return {
      messageId: data.messages[0].id
    };
  }

  /**
   * Enviar contacto (vCard)
   */
  async sendContact(
    to: string, 
    name: string, 
    phone: string, 
    organization?: string
  ): Promise<{ messageId: string }> {
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
        type: 'contacts',
        contacts: [{
          name: {
            formatted_name: name,
            first_name: name.split(' ')[0],
            last_name: name.split(' ').slice(1).join(' ') || ''
          },
          phones: [{
            phone: phone,
            type: 'MOBILE'
          }],
          ...(organization && {
            org: {
              company: organization
            }
          })
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send contact: ${response.status}`);
    }

    const data = await response.json();
    return {
      messageId: data.messages[0].id
    };
  }

  /**
   * Función auxiliar: Sleep/Delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enviar mensaje fragmentado con delays
   * Este es el método principal para mensajes conversacionales
   */
  async sendFragmentedMessage(
    to: string, 
    fragments: import('@/types/message-fragments.types').MessageFragment[]
  ): Promise<string[]> {
    const messageIds: string[] = [];

    for (const fragment of fragments) {
      // Delay antes de enviar (simular escritura)
      if (fragment.delay > 0) {
        await this.sleep(fragment.delay);
      }

      // Enviar según tipo
      let result: { messageId: string };

      switch (fragment.type) {
        case 'text':
          result = await this.sendTextMessage({ 
            to, 
            message: fragment.content 
          });
          break;

        case 'image':
          result = await this.sendImage(to, fragment.url, fragment.caption);
          break;

        case 'video':
          result = await this.sendVideo(to, fragment.url, fragment.caption);
          break;

        case 'document':
          result = await this.sendDocument(to, fragment.url, fragment.caption);
          break;

        case 'location':
          result = await this.sendLocation(
            to, 
            fragment.latitude, 
            fragment.longitude, 
            fragment.name, 
            fragment.address
          );
          break;

        case 'audio':
          result = await this.sendAudio(to, fragment.url);
          break;

        case 'contact':
          result = await this.sendContact(
            to, 
            fragment.name, 
            fragment.phone, 
            fragment.organization
          );
          break;

        default:
          console.warn(`Unknown fragment type: ${(fragment as any).type}`);
          continue;
      }

      messageIds.push(result.messageId);
    }

    return messageIds;
  }
}

// Singleton
export const whatsappSender = new WhatsAppMessageSender();
