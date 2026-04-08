import { query, queryOne, execute, insert } from '../database/connection.js';
import type { Student } from '../domain/rules.js';

export class StudentService {
  /** Busca aluno por telefone. Cria registro se não existir. */
  findOrCreate(phone: string): Student {
    const existing = queryOne<Student>('SELECT * FROM students WHERE phone = ?', [phone]);
    if (existing) return existing;

    const id = insert('INSERT INTO students (phone) VALUES (?)', [phone]);
    return queryOne<Student>('SELECT * FROM students WHERE id = ?', [id])!;
  }

  /** Atualiza o nome do aluno */
  updateName(phone: string, name: string): Student {
    execute('UPDATE students SET name = ? WHERE phone = ?', [name, phone]);
    const result = queryOne<Student>('SELECT * FROM students WHERE phone = ?', [phone]);
    if (!result) throw new Error(`Aluno com telefone ${phone} não encontrado`);
    return result;
  }

  /** Busca aluno por ID */
  findById(id: number): Student | undefined {
    return queryOne<Student>('SELECT * FROM students WHERE id = ?', [id]);
  }
}
