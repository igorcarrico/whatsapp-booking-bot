import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { BookingAssistant } from '../ai/assistant.js';
import { WhatsAppClient } from './client.js';
import type { WhatsAppWebhookPayload } from './types.js';
import { logger } from '../logger.js';

/** IDs de mensagens já processadas (evita duplicatas) */
const processedMessages = new Set<string>();
const MAX_PROCESSED_CACHE = 10000;

function trackMessageId(id: string) {
  processedMessages.add(id);
  if (processedMessages.size > MAX_PROCESSED_CACHE) {
    const first = processedMessages.values().next().value;
    if (first) processedMessages.delete(first);
  }
}

export function registerWhatsAppWebhook(app: FastifyInstance) {
  const assistant = new BookingAssistant();
  const whatsappClient = new WhatsAppClient();

  // ── Verificação do webhook (GET) ──
  app.get('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
      logger.info('Webhook verificado com sucesso');
      return reply.code(200).send(challenge);
    }

    logger.warn('Tentativa de verificação do webhook com token inválido');
    return reply.code(403).send('Forbidden');
  });

  // ── Recebimento de mensagens (POST) ──
  app.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as WhatsAppWebhookPayload;

    // Responde imediatamente (WhatsApp exige resposta rápida)
    reply.code(200).send('EVENT_RECEIVED');

    // Processa assincronamente
    try {
      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const messages = change.value.messages;
          if (!messages) continue;

          for (const message of messages) {
            // Ignora mensagens não-texto (por enquanto)
            if (message.type !== 'text' || !message.text?.body) {
              logger.info({ type: message.type, from: message.from }, 'Mensagem não-texto ignorada');
              continue;
            }

            // Deduplicação
            if (processedMessages.has(message.id)) {
              logger.debug({ messageId: message.id }, 'Mensagem duplicada ignorada');
              continue;
            }
            trackMessageId(message.id);

            const phone = message.from;
            const text = message.text.body.trim();

            logger.info({ phone, text: text.substring(0, 100) }, 'Processando mensagem WhatsApp');

            // Marca como lida
            whatsappClient.markAsRead(message.id).catch(() => {});

            // Processa com o assistente
            const botReply = await assistant.processMessage(phone, text);

            // Envia resposta
            await whatsappClient.sendText(phone, botReply);
          }
        }
      }
    } catch (err) {
      logger.error({ error: err }, 'Erro ao processar webhook WhatsApp');
    }
  });

  // ── Endpoint de simulação (para desenvolvimento) ──
  app.post('/chat', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { phone: string; message: string };

    if (!body.phone || !body.message) {
      return reply.code(400).send({ error: 'Campos "phone" e "message" são obrigatórios' });
    }

    const botReply = await assistant.processMessage(body.phone, body.message);
    return reply.send({ phone: body.phone, reply: botReply });
  });

  // ── Endpoints administrativos ──
  app.get('/admin/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: 'ok', uptime: process.uptime() });
  });
}
