import { query, queryOne, execute, insert } from '../database/connection.js';
import {
  type AvailableSlot,
  type CreateReservationInput,
  type Reservation,
  BusinessRuleError,
  calculateEndTime,
  generateAllSlots,
  hasTimeConflict,
  isValidDate,
  isValidDuration,
  isValidTime,
  isWithinOperatingHours,
  canCancelReservation,
  timeToMinutes,
  minutesToTime,
} from '../domain/rules.js';
import { CourtService } from './court.service.js';
import { logger } from '../logger.js';

export class ReservationService {
  private courtService = new CourtService();

  /** Busca reservas confirmadas para uma data (e opcionalmente uma quadra) */
  getReservationsForDate(date: string, courtId?: number): Reservation[] {
    if (courtId) {
      return query<Reservation>(
        'SELECT * FROM reservations WHERE date = ? AND status = ? AND court_id = ?',
        [date, 'confirmed', courtId],
      );
    }
    return query<Reservation>(
      'SELECT * FROM reservations WHERE date = ? AND status = ?',
      [date, 'confirmed'],
    );
  }

  /** Retorna slots disponíveis para uma data, agrupados por quadra */
  checkAvailability(date: string, courtId?: number): AvailableSlot[] {
    if (!isValidDate(date)) throw new BusinessRuleError('Data inválida. Use o formato YYYY-MM-DD.');

    const activeCourts = courtId
      ? [this.courtService.findById(courtId)].filter(Boolean)
      : this.courtService.listActive();

    if (activeCourts.length === 0) throw new BusinessRuleError('Nenhuma quadra encontrada.');

    const allSlots = generateAllSlots();
    const available: AvailableSlot[] = [];

    for (const court of activeCourts) {
      if (!court) continue;
      const booked = this.getReservationsForDate(date, court.id);

      for (const slotStart of allSlots) {
        const slotEnd = minutesToTime(timeToMinutes(slotStart) + 60);
        const isOccupied = booked.some((r) =>
          hasTimeConflict(slotStart, slotEnd, r.start_time, r.end_time),
        );
        if (!isOccupied) {
          available.push({
            courtId: court.id,
            courtName: court.name,
            startTime: slotStart,
            endTime: slotEnd,
          });
        }
      }
    }

    return available;
  }

  /** Cria uma nova reserva após todas as validações */
  createReservation(input: CreateReservationInput): Reservation {
    const { studentId, courtId, date, startTime, durationHours } = input;

    if (!isValidDate(date)) throw new BusinessRuleError('Data inválida. Use o formato YYYY-MM-DD.');
    if (!isValidTime(startTime))
      throw new BusinessRuleError('Horário inválido. Use o formato HH:MM.');
    if (!isValidDuration(durationHours))
      throw new BusinessRuleError(
        `Duração deve ser entre 1 e 2 horas. Você informou ${durationHours}h.`,
      );

    const endTime = calculateEndTime(startTime, durationHours);

    if (!isWithinOperatingHours(startTime, endTime)) {
      throw new BusinessRuleError(
        `O horário ${startTime}–${endTime} está fora do funcionamento (06:00–22:00).`,
      );
    }

    const court = this.courtService.findById(courtId);
    if (!court || !court.active) throw new BusinessRuleError('Quadra não encontrada ou inativa.');

    const existing = this.getReservationsForDate(date, courtId);
    const conflict = existing.find((r) =>
      hasTimeConflict(startTime, endTime, r.start_time, r.end_time),
    );
    if (conflict) {
      throw new BusinessRuleError(
        `A ${court.name} já está reservada das ${conflict.start_time} às ${conflict.end_time} nessa data.`,
      );
    }

    const id = insert(
      `INSERT INTO reservations (student_id, court_id, date, start_time, end_time, status)
       VALUES (?, ?, ?, ?, ?, 'confirmed')`,
      [studentId, courtId, date, startTime, endTime],
    );

    const reservation = queryOne<Reservation>('SELECT * FROM reservations WHERE id = ?', [id])!;
    logger.info({ reservationId: id, studentId, courtId, date, startTime, endTime }, 'Reserva criada');
    return reservation;
  }

  /** Cancela uma reserva existente */
  cancelReservation(reservationId: number, studentId: number, now: Date): Reservation {
    const reservation = queryOne<Reservation>(
      'SELECT * FROM reservations WHERE id = ? AND status = ?',
      [reservationId, 'confirmed'],
    );

    if (!reservation) throw new BusinessRuleError('Reserva não encontrada ou já cancelada.');
    if (reservation.student_id !== studentId)
      throw new BusinessRuleError('Você não pode cancelar uma reserva de outro aluno.');
    if (!canCancelReservation(reservation.date, reservation.start_time, now))
      throw new BusinessRuleError(
        'Cancelamento permitido somente até 2 horas antes do horário da reserva.',
      );

    execute(
      "UPDATE reservations SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?",
      [reservationId],
    );

    logger.info({ reservationId }, 'Reserva cancelada');
    return queryOne<Reservation>('SELECT * FROM reservations WHERE id = ?', [reservationId])!;
  }

  /** Reagenda uma reserva: cancela a atual e cria nova */
  rescheduleReservation(
    reservationId: number,
    studentId: number,
    newDate: string,
    newStartTime: string,
    now: Date,
  ): Reservation {
    const old = this.cancelReservation(reservationId, studentId, now);

    const durationMinutes =
      timeToMinutes(old.end_time) - timeToMinutes(old.start_time);

    try {
      return this.createReservation({
        studentId,
        courtId: old.court_id,
        date: newDate,
        startTime: newStartTime,
        durationHours: durationMinutes / 60,
      });
    } catch (err) {
      // Se a nova reserva falhar, restaura a original
      execute(
        "UPDATE reservations SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?",
        [reservationId],
      );
      throw err;
    }
  }

  /** Lista reservas futuras de um aluno */
  listStudentReservations(
    studentId: number,
    includePast: boolean = false,
  ): (Reservation & { courtName: string })[] {
    const today = new Date().toISOString().split('T')[0];

    const sql = includePast
      ? `SELECT r.*, c.name as courtName FROM reservations r
         INNER JOIN courts c ON r.court_id = c.id
         WHERE r.student_id = ? AND r.status = 'confirmed'
         ORDER BY r.date, r.start_time`
      : `SELECT r.*, c.name as courtName FROM reservations r
         INNER JOIN courts c ON r.court_id = c.id
         WHERE r.student_id = ? AND r.status = 'confirmed' AND r.date >= ?
         ORDER BY r.date, r.start_time`;

    const params = includePast ? [studentId] : [studentId, today];
    return query(sql, params);
  }

  /** Sugere horários alternativos próximos a um horário desejado */
  suggestAlternatives(date: string, desiredTime: string, maxSuggestions: number = 3): AvailableSlot[] {
    const available = this.checkAvailability(date);
    const desiredMinutes = timeToMinutes(desiredTime);

    return available
      .map((slot) => ({
        ...slot,
        distance: Math.abs(timeToMinutes(slot.startTime) - desiredMinutes),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxSuggestions)
      .map(({ distance: _d, ...slot }) => slot);
  }
}
