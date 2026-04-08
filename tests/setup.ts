import { createDatabase, closeDatabase, execute } from '../src/database/connection.js';
import { beforeAll, afterAll, beforeEach } from 'vitest';

beforeAll(async () => {
  await createDatabase(':memory:');

  // Seed com quadras de teste
  execute('INSERT INTO courts (name, type) VALUES (?, ?)', ['Beach 1', 'beach_tennis']);
  execute('INSERT INTO courts (name, type) VALUES (?, ?)', ['Beach 2', 'beach_tennis']);
  execute('INSERT INTO courts (name, type) VALUES (?, ?)', ['Beach 3', 'futevolei']);
  execute('INSERT INTO courts (name, type) VALUES (?, ?)', ['Beach 4', 'volei_de_praia']);
});

beforeEach(() => {
  execute('DELETE FROM reservations');
  execute('DELETE FROM conversation_logs');
  execute('DELETE FROM students');
});

afterAll(() => {
  closeDatabase();
});
