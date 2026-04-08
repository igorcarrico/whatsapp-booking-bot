import { query, queryOne } from '../database/connection.js';
import type { Court } from '../domain/rules.js';

export class CourtService {
  /** Lista todas as quadras ativas */
  listActive(): Court[] {
    return query<Court>('SELECT * FROM courts WHERE active = 1');
  }

  /** Busca quadra por ID */
  findById(id: number): Court | undefined {
    return queryOne<Court>('SELECT * FROM courts WHERE id = ?', [id]);
  }

  /** Busca quadra por nome (case-insensitive, match parcial) */
  findByName(name: string): Court | undefined {
    const all = this.listActive();
    const normalized = name.toLowerCase().trim();
    return all.find(
      (c) =>
        c.name.toLowerCase() === normalized ||
        c.name.toLowerCase().includes(normalized) ||
        normalized.includes(c.name.toLowerCase()),
    );
  }
}
