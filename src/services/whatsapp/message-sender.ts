/**
 * WhatsApp Message Sender
 * Envía mensajes a través de WhatsApp Business API
 */

const WHATSAPP_API_URL = 'https://graph.facebook.com/v24.0';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const WHATSAPP_TOKEN = process.env.WHATSAPP_API_TOKEN!;

export interface SendMessageParams {
  to: string;
  message: string;
  previewUrl?: boolean;
}

export interface ReplyButton {
  id: string;
  title: string; // Máximo 20 caracteres
}

export interface SendButtonsParams {
  to: string;
  bodyText: string;
  buttons: ReplyButton[];
}

export interface ListRow {
  id: string;
  title: string; // Máximo 24 caracteres
  description?: string; // Máximo 72 caracteres
}

export interface SendListParams {
  to: string;
  bodyText: string;
  buttonText: string; // Máximo 20 caracteres, abre la lista
  rows: ListRow[];
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
  async sendDocument(to: string, documentUrl: string, caption?: string, filename?: string): Promise<{ messageId: string }> {
    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;

    // Extraer nombre del archivo de la URL si no se proporciona
    const resolvedFilename = filename || this.extractFilenameFromUrl(documentUrl);

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
          caption: caption || '',
          filename: resolvedFilename
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

  private extractFilenameFromUrl(url: string): string {
    const raw = url.split('/').pop() || 'documento';
    return raw.replace(/^\d+_/, '') || raw;
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
   * Enviar indicador de "escribiendo..." (typing indicator)
   * Se muestra por máximo 25 segundos o hasta enviar un mensaje
   */
  async sendTypingIndicator(to: string, messageId: string): Promise<void> {
    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
          typing_indicator: {
            type: 'text'
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.warn(`Failed to send typing indicator: ${response.status}`, error);
        // No lanzar error, es un feature no crítico
      }
    } catch (error) {
      console.warn('Error sending typing indicator:', error);
      // No lanzar error para no bloquear el flujo principal
    }
  }

  /**
   * Enviar mensaje usando template de WhatsApp
   */
  async sendTemplateMessage(params: {
    to: string;
    templateName: string;
    languageCode: string;
    components: Array<{
      type: string;
      parameters: Array<{ type: string; text: string }>;
    }>;
  }): Promise<{ messageId: string }> {
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
        to: params.to,
        type: 'template',
        template: {
          name: params.templateName,
          language: {
            code: params.languageCode
          },
          components: params.components
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('WhatsApp template send error:', error);
      throw new Error(`Failed to send template message: ${response.status}`);
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
          result = await this.sendDocument(to, fragment.url, fragment.caption, fragment.filename);
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

  /**
   * Enviar mensaje con botones interactivos (Reply Buttons)
   * Máximo 3 botones, 20 caracteres por botón
   */
  async sendInteractiveButtons({ to, bodyText, buttons }: SendButtonsParams): Promise<{ messageId: string }> {
    if (buttons.length > 3) {
      throw new Error('WhatsApp permite máximo 3 botones de respuesta');
    }

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
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: bodyText
          },
          action: {
            buttons: buttons.map(btn => ({
              type: 'reply',
              reply: {
                id: btn.id,
                title: btn.title.substring(0, 20) // Asegurar máximo 20 chars
              }
            }))
          }
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('WhatsApp API error:', error);
      throw new Error(`Failed to send interactive buttons: ${response.status}`);
    }

    const data = await response.json();
    return {
      messageId: data.messages[0].id
    };
  }

  /**
   * Enviar mensaje de lista interactiva (Interactive List)
   * De 4 a 10 opciones: el rango que ya no cabe en botones de respuesta.
   */
  async sendListMessage({ to, bodyText, buttonText, rows }: SendListParams): Promise<{ messageId: string }> {
    if (rows.length === 0) {
      throw new Error('Una lista interactiva necesita al menos una opción');
    }
    if (rows.length > 10) {
      throw new Error('WhatsApp permite máximo 10 filas en un mensaje de lista');
    }

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
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: bodyText
          },
          action: {
            button: buttonText.substring(0, 20),
            sections: [{
              rows: rows.map(row => ({
                id: row.id,
                title: row.title.substring(0, 24),
                ...(row.description ? { description: row.description.substring(0, 72) } : {}),
              })),
            }],
          }
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('WhatsApp API error:', error);
      throw new Error(`Failed to send list message: ${response.status}`);
    }

    const data = await response.json();
    return {
      messageId: data.messages[0].id
    };
  }
}

// Singleton
export const whatsappSender = new WhatsAppMessageSender();
