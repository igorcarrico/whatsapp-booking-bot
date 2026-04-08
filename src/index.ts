import './env.js';
import { createDatabase } from './database/connection.js';
import { config } from './config.js';
import { startServer } from './server.js';
import { logger } from './logger.js';

async function main() {
  logger.info(`Iniciando ${config.center.name} Bot...`);

  // Inicializar banco de dados
  await createDatabase(config.databasePath);

  // Seed automático (cria quadras se o banco estiver vazio)
  const { query, execute } = await import('./database/connection.js');
  const courts = query('SELECT * FROM courts');
  if (courts.length === 0) {
    logger.info('Banco vazio — executando seed...');
    const courtsData = [
      { name: 'Beach 1', type: 'beach_tennis' },
      { name: 'Beach 2', type: 'beach_tennis' },
      { name: 'Beach 3', type: 'futevolei' },
      { name: 'Beach 4', type: 'volei_de_praia' },
    ];
    for (const court of courtsData) {
      execute('INSERT INTO courts (name, type) VALUES (?, ?)', [court.name, court.type]);
    }
    logger.info(`Seed concluído: ${courtsData.length} quadras criadas`);
  }

  // Iniciar servidor
  await startServer();

  logger.info(`${config.center.name} Bot pronto para atender!`);
}

main().catch((err) => {
  logger.error({ error: err }, 'Falha fatal ao iniciar');
  process.exit(1);
});
