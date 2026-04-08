import { config } from '../config.js';

// ── Tipos do domínio ──

export interface Student {
  id: number;
  name: string | null;
  phone: string;
  created_at: string;
}

export interface Court {
  id: number;
  name: string;
  type: string;
  active: number; // SQLite boolean: 0 ou 1
}

export interface Reservation {
  id: number;
  student_id: number;
  court_id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: 'confirmed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface AvailableSlot {
  courtId: number;
  courtName: string;
  startTime: string;
  endTime: string;
}

export interface CreateReservationInput {
  studentId: number;
  courtId: number;
  date: string;
  startTime: string;
  durationHours: number;
}

// ── Regras de negócio ──

export class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}

/** Converte "HH:MM" para minutos desde meia-noite */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Converte minutos desde meia-noite para "HH:MM" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Calcula o horário de fim baseado no início e duração */
export function calculateEndTime(startTime: string, durationHours: number): string {
  const startMinutes = timeToMinutes(startTime);
  return minutesToTime(startMinutes + durationHours * 60);
}

/** Verifica se o horário está dentro do funcionamento */
export function isWithinOperatingHours(startTime: string, endTime: string): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const open = timeToMinutes(config.center.openTime);
  const close = timeToMinutes(config.center.closeTime);
  return start >= open && end <= close && start < end;
}

/** Verifica se a duração é válida */
export function isValidDuration(hours: number): boolean {
  return hours >= config.center.minDurationHours && hours <= config.center.maxDurationHours;
}

/** Verifica se dois intervalos de tempo se sobrepõem */
export function hasTimeConflict(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return s1 < e2 && s2 < e1;
}

/** Gera todos os slots de 1h dentro do horário de funcionamento */
export function generateAllSlots(): string[] {
  const open = timeToMinutes(config.center.openTime);
  const close = timeToMinutes(config.center.closeTime);
  const slots: string[] = [];
  for (let t = open; t < close; t += 60) {
    slots.push(minutesToTime(t));
  }
  return slots;
}

/** Verifica se o cancelamento ainda é permitido (2h antes do horário) */
export function canCancelReservation(date: string, startTime: string, now: Date): boolean {
  const reservationDateTime = new Date(`${date}T${startTime}:00`);
  const deadlineMs = config.center.cancellationDeadlineHours * 60 * 60 * 1000;
  return now.getTime() + deadlineMs <= reservationDateTime.getTime();
}

/** Valida formato de data YYYY-MM-DD */
export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}

/** Valida formato de hora HH:MM */
export function isValidTime(time: string): boolean {
  return /^\d{2}:\d{2}$/.test(time) && timeToMinutes(time) >= 0 && timeToMinutes(time) < 1440;
}
