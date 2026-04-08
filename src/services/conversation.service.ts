import { query, execute } from '../database/connection.js';

export class ConversationService {
  /** Registra uma mensagem no log */
  log(phone: string, direction: 'inbound' | 'outbound', message: string, metadata?: object): void {
    execute(
      'INSERT INTO conversation_logs (phone, direction, message, metadata) VALUES (?, ?, ?, ?)',
      [phone, direction, message, metadata ? JSON.stringify(metadata) : null],
    );
  }

  /** Busca histórico recente de conversa */
  getHistory(phone: string, limit: number = 50) {
    return query(
      'SELECT * FROM conversation_logs WHERE phone = ? ORDER BY created_at DESC LIMIT ?',
      [phone, limit],
    ).reverse();
  }
}
