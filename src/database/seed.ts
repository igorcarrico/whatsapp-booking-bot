import '../env.js';
import { createDatabase, closeDatabase, query, execute } from './connection.js';
import { logger } from '../logger.js';

async function seed() {
  const dbPath = process.env.DATABASE_PATH || './data/arena.db';
  await createDatabase(dbPath);

  // Verificar se já tem quadras
  const existing = query('SELECT * FROM courts');
  if (existing.length > 0) {
    logger.info(`Banco já contém ${existing.length} quadras. Seed ignorado.`);
    closeDatabase();
    return;
  }

  // Inserir quadras
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
  for (const court of courtsData) {
    logger.info(`  - ${court.name} (${court.type})`);
  }

  closeDatabase();
}

seed();
