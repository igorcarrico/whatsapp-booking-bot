import { config } from '../config.js';
import { logger } from '../logger.js';

/** Cliente para enviar mensagens via WhatsApp Business Cloud API */
export class WhatsAppClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor() {
    this.baseUrl = `https://graph.facebook.com/v21.0/${config.whatsapp.phoneNumberId}/messages`;
    this.accessToken = config.whatsapp.accessToken;
  }

  /** Envia mensagem de texto para um número */
  async sendText(to: string, text: string): Promise<void> {
    if (!this.accessToken) {
      logger.warn('WhatsApp access token não configurado — mensagem não enviada');
      logger.info({ to, text }, 'Mensagem que seria enviada via WhatsApp');
      return;
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: text },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ to, status: response.status, error }, 'Erro ao enviar WhatsApp');
        throw new Error(`WhatsApp API error: ${response.status} — ${error}`);
      }

      logger.info({ to }, 'Mensagem WhatsApp enviada');
    } catch (err) {
      logger.error({ to, error: err }, 'Falha ao enviar mensagem WhatsApp');
      throw err;
    }
  }

  /** Marca mensagem como lida */
  async markAsRead(messageId: string): Promise<void> {
    if (!this.accessToken) return;

    try {
      await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });
    } catch {
      // Não é crítico — ignora silenciosamente
    }
  }
}
