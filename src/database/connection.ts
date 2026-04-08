import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { logger } from '../logger.js';

let db: Database | null = null;
let dbPath: string | null = null;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS courts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id),
    court_id INTEGER NOT NULL REFERENCES courts(id),
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    direction TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
  CREATE INDEX IF NOT EXISTS idx_reservations_court_date ON reservations(court_id, date);
  CREATE INDEX IF NOT EXISTS idx_reservations_student ON reservations(student_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_phone ON conversation_logs(phone);
`;

export async function createDatabase(path: string): Promise<Database> {
  const SQL = await initSqlJs();

  if (path === ':memory:') {
    db = new SQL.Database();
  } else {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (existsSync(path)) {
      const buffer = readFileSync(path);
      db = new SQL.Database(buffer);
      logger.info({ path }, 'Banco de dados carregado do arquivo');
    } else {
      db = new SQL.Database();
      logger.info({ path }, 'Novo banco de dados criado');
    }
    dbPath = path;
  }

  db.run('PRAGMA foreign_keys = ON;');
  db.run(SCHEMA_SQL);
  saveDatabase();

  logger.info('Banco de dados inicializado');
  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Banco de dados não inicializado. Chame createDatabase() primeiro.');
  }
  return db;
}

/** Persiste o banco para o arquivo (se não for :memory:) */
export function saveDatabase(): void {
  if (db && dbPath) {
    const data = db.export();
    writeFileSync(dbPath, Buffer.from(data));
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    dbPath = null;
    logger.info('Banco de dados fechado');
  }
}

// ── Helpers para queries tipadas ──

export interface Row {
  [key: string]: unknown;
}

/** Executa SELECT e retorna array de objetos */
export function query<T = Row>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  stmt.bind(params as (string | number | null)[]);

  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

/** Executa SELECT e retorna o primeiro resultado ou undefined */
export function queryOne<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  const results = query<T>(sql, params);
  return results[0];
}

/** Executa INSERT/UPDATE/DELETE e retorna informações */
export function execute(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params as (string | number | null)[]);
  saveDatabase();
}

/** Executa INSERT e retorna o ID gerado */
export function insert(sql: string, params: unknown[] = []): number {
  getDb().run(sql, params as (string | number | null)[]);
  const result = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
  saveDatabase();
  return result?.id ?? 0;
}
