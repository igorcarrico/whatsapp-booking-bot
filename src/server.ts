import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { registerWhatsAppWebhook } from './whatsapp/webhook.js';
import { logger } from './logger.js';

export async function createServer() {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
  });

  // Middleware de log de requisições
  app.addHook('onRequest', async (request) => {
    logger.debug({ method: request.method, url: request.url }, 'Requisição recebida');
  });

  // Middleware de erro global
  app.setErrorHandler(async (error, _request, reply) => {
    logger.error({ error: error.message, stack: error.stack }, 'Erro não tratado');
    return reply.code(500).send({ error: 'Erro interno do servidor' });
  });

  // Página de chat (interface web)
  const publicDir = resolve(process.cwd(), 'public');
  app.get('/', async (_request, reply) => {
    try {
      const html = readFileSync(join(publicDir, 'index.html'), 'utf-8');
      return reply.type('text/html').send(html);
    } catch {
      return reply.code(404).send('Página não encontrada');
    }
  });

  // Registrar rotas
  registerWhatsAppWebhook(app);

  return app;
}

export async function startServer() {
  const app = await createServer();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Servidor rodando em http://0.0.0.0:${config.port}`);
    logger.info(`Endpoint de chat: POST http://localhost:${config.port}/chat`);
    logger.info(`Webhook WhatsApp: POST http://localhost:${config.port}/webhook`);
    logger.info(`Health check: GET http://localhost:${config.port}/admin/health`);
  } catch (err) {
    logger.error({ error: err }, 'Falha ao iniciar servidor');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Encerrando servidor...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return app;
}
