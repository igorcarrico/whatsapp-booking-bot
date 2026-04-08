import './env.js';
import { createDatabase } from './database/connection.js';
import { config } from './config.js';
import { startServer } from './server.js';
import { logger } from './logger.js';

async function main() {
  logger.info(`Iniciando ${config.center.name} Bot...`);

  // Inicializar banco de dados
  await createDatabase(config.databasePath);

  // Iniciar servidor
  await startServer();

  logger.info(`${config.center.name} Bot pronto para atender!`);
}

main().catch((err) => {
  logger.error({ error: err }, 'Falha fatal ao iniciar');
  process.exit(1);
});
