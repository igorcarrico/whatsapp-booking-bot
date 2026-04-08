// Schema de referência — as tabelas são criadas diretamente em connection.ts
// Este arquivo serve como documentação da estrutura do banco

/**
 * students
 *   id          INTEGER PRIMARY KEY AUTOINCREMENT
 *   name        TEXT
 *   phone       TEXT NOT NULL UNIQUE
 *   created_at  TEXT NOT NULL DEFAULT datetime('now')
 *
 * courts
 *   id          INTEGER PRIMARY KEY AUTOINCREMENT
 *   name        TEXT NOT NULL
 *   type        TEXT NOT NULL
 *   active      INTEGER NOT NULL DEFAULT 1
 *
 * reservations
 *   id          INTEGER PRIMARY KEY AUTOINCREMENT
 *   student_id  INTEGER NOT NULL → students(id)
 *   court_id    INTEGER NOT NULL → courts(id)
 *   date        TEXT NOT NULL          (YYYY-MM-DD)
 *   start_time  TEXT NOT NULL          (HH:MM)
 *   end_time    TEXT NOT NULL          (HH:MM)
 *   status      TEXT NOT NULL DEFAULT 'confirmed'  ('confirmed' | 'cancelled')
 *   created_at  TEXT NOT NULL DEFAULT datetime('now')
 *   updated_at  TEXT NOT NULL DEFAULT datetime('now')
 *
 * conversation_logs
 *   id          INTEGER PRIMARY KEY AUTOINCREMENT
 *   phone       TEXT NOT NULL
 *   direction   TEXT NOT NULL          ('inbound' | 'outbound')
 *   message     TEXT NOT NULL
 *   metadata    TEXT                   (JSON)
 *   created_at  TEXT NOT NULL DEFAULT datetime('now')
 */
