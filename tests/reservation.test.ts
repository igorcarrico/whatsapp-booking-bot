import { describe, it, expect } from 'vitest';
import { ReservationService } from '../src/services/reservation.service.js';
import { StudentService } from '../src/services/student.service.js';
import { CourtService } from '../src/services/court.service.js';
import {
  timeToMinutes,
  minutesToTime,
  calculateEndTime,
  isWithinOperatingHours,
  hasTimeConflict,
  isValidDate,
  isValidTime,
  BusinessRuleError,
} from '../src/domain/rules.js';

// ── Testes das regras de domínio ──

describe('Regras de domínio', () => {
  it('converte horário para minutos corretamente', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('06:00')).toBe(360);
    expect(timeToMinutes('18:30')).toBe(1110);
    expect(timeToMinutes('22:00')).toBe(1320);
  });

  it('converte minutos para horário corretamente', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(360)).toBe('06:00');
    expect(minutesToTime(1110)).toBe('18:30');
  });

  it('calcula horário de fim corretamente', () => {
    expect(calculateEndTime('18:00', 1)).toBe('19:00');
    expect(calculateEndTime('18:00', 2)).toBe('20:00');
    expect(calculateEndTime('06:00', 1)).toBe('07:00');
  });

  it('valida horário de funcionamento', () => {
    expect(isWithinOperatingHours('06:00', '07:00')).toBe(true);
    expect(isWithinOperatingHours('21:00', '22:00')).toBe(true);
    expect(isWithinOperatingHours('05:00', '06:00')).toBe(false);
    expect(isWithinOperatingHours('21:00', '23:00')).toBe(false);
    expect(isWithinOperatingHours('22:00', '23:00')).toBe(false);
  });

  it('detecta conflito de horários', () => {
    expect(hasTimeConflict('18:00', '19:00', '18:00', '19:00')).toBe(true);
    expect(hasTimeConflict('18:00', '19:00', '18:30', '19:30')).toBe(true);
    expect(hasTimeConflict('18:00', '20:00', '19:00', '20:00')).toBe(true);
    expect(hasTimeConflict('18:00', '19:00', '19:00', '20:00')).toBe(false);
    expect(hasTimeConflict('18:00', '19:00', '17:00', '18:00')).toBe(false);
  });

  it('valida formato de data', () => {
    expect(isValidDate('2026-04-08')).toBe(true);
    expect(isValidDate('2026-12-31')).toBe(true);
    expect(isValidDate('08/04/2026')).toBe(false);
    expect(isValidDate('abc')).toBe(false);
  });

  it('valida formato de hora', () => {
    expect(isValidTime('18:00')).toBe(true);
    expect(isValidTime('06:30')).toBe(true);
    expect(isValidTime('25:00')).toBe(false);
    expect(isValidTime('abc')).toBe(false);
  });
});

// ── Testes dos serviços ──

describe('StudentService', () => {
  const service = new StudentService();

  it('cria aluno por telefone se não existir', () => {
    const student = service.findOrCreate('5511999990001');
    expect(student.phone).toBe('5511999990001');
    expect(student.id).toBeGreaterThan(0);
  });

  it('retorna aluno existente sem duplicar', () => {
    const s1 = service.findOrCreate('5511999990002');
    const s2 = service.findOrCreate('5511999990002');
    expect(s1.id).toBe(s2.id);
  });

  it('atualiza nome do aluno', () => {
    service.findOrCreate('5511999990003');
    const updated = service.updateName('5511999990003', 'João Silva');
    expect(updated.name).toBe('João Silva');
  });
});

describe('CourtService', () => {
  const service = new CourtService();

  it('lista quadras ativas', () => {
    const courts = service.listActive();
    expect(courts.length).toBe(4);
    expect(courts[0].name).toBe('Beach 1');
  });

  it('busca quadra por ID', () => {
    const court = service.findById(1);
    expect(court).toBeDefined();
    expect(court!.name).toBe('Beach 1');
  });

  it('busca quadra por nome', () => {
    const court = service.findByName('beach 2');
    expect(court).toBeDefined();
    expect(court!.id).toBe(2);
  });

  it('retorna undefined para quadra inexistente', () => {
    expect(service.findById(999)).toBeUndefined();
    expect(service.findByName('inexistente')).toBeUndefined();
  });
});

describe('ReservationService', () => {
  const reservationService = new ReservationService();
  const studentService = new StudentService();

  function createStudent(phone: string = '5511999990010') {
    return studentService.findOrCreate(phone);
  }

  it('consulta disponibilidade retorna slots', () => {
    const slots = reservationService.checkAvailability('2026-04-10');
    // 16 slots (06:00-22:00) x 4 quadras = 64
    expect(slots.length).toBe(64);
  });

  it('cria reserva com sucesso', () => {
    const student = createStudent();
    const reservation = reservationService.createReservation({
      studentId: student.id,
      courtId: 1,
      date: '2026-04-10',
      startTime: '18:00',
      durationHours: 1,
    });

    expect(reservation.id).toBeGreaterThan(0);
    expect(reservation.start_time).toBe('18:00');
    expect(reservation.end_time).toBe('19:00');
    expect(reservation.status).toBe('confirmed');
  });

  it('impede reserva em horário já ocupado', () => {
    const student = createStudent();
    reservationService.createReservation({
      studentId: student.id,
      courtId: 1,
      date: '2026-04-10',
      startTime: '18:00',
      durationHours: 1,
    });

    expect(() =>
      reservationService.createReservation({
        studentId: student.id,
        courtId: 1,
        date: '2026-04-10',
        startTime: '18:00',
        durationHours: 1,
      }),
    ).toThrow(BusinessRuleError);
  });

  it('permite reserva na mesma hora em quadra diferente', () => {
    const student = createStudent();
    reservationService.createReservation({
      studentId: student.id,
      courtId: 1,
      date: '2026-04-10',
      startTime: '18:00',
      durationHours: 1,
    });

    const r2 = reservationService.createReservation({
      studentId: student.id,
      courtId: 2,
      date: '2026-04-10',
      startTime: '18:00',
      durationHours: 1,
    });
    expect(r2.court_id).toBe(2);
  });

  it('impede reserva fora do horário de funcionamento', () => {
    const student = createStudent();

    expect(() =>
      reservationService.createReservation({
        studentId: student.id,
        courtId: 1,
        date: '2026-04-10',
        startTime: '05:00',
        durationHours: 1,
      }),
    ).toThrow(BusinessRuleError);

    expect(() =>
      reservationService.createReservation({
        studentId: student.id,
        courtId: 1,
        date: '2026-04-10',
        startTime: '21:00',
        durationHours: 2,
      }),
    ).toThrow(BusinessRuleError);
  });

  it('impede duração inválida', () => {
    const student = createStudent();

    expect(() =>
      reservationService.createReservation({
        studentId: student.id,
        courtId: 1,
        date: '2026-04-10',
        startTime: '18:00',
        durationHours: 3,
      }),
    ).toThrow(BusinessRuleError);
  });

  it('disponibilidade reflete reservas existentes', () => {
    const student = createStudent();
    reservationService.createReservation({
      studentId: student.id,
      courtId: 1,
      date: '2026-04-10',
      startTime: '18:00',
      durationHours: 2,
    });

    const slots = reservationService.checkAvailability('2026-04-10', 1);
    const times = slots.map((s) => s.startTime);
    expect(times).not.toContain('18:00');
    expect(times).not.toContain('19:00');
    expect(times).toContain('17:00');
    expect(times).toContain('20:00');
  });

  it('cancela reserva com sucesso', () => {
    const student = createStudent();
    const reservation = reservationService.createReservation({
      studentId: student.id,
      courtId: 1,
      date: '2030-12-31',
      startTime: '18:00',
      durationHours: 1,
    });

    const cancelled = reservationService.cancelReservation(
      reservation.id,
      student.id,
      new Date('2030-12-31T10:00:00'),
    );
    expect(cancelled.status).toBe('cancelled');
  });

  it('impede cancelar reserva de outro aluno', () => {
    const s1 = studentService.findOrCreate('5511999990011');
    const s2 = studentService.findOrCreate('5511999990012');

    const reservation = reservationService.createReservation({
      studentId: s1.id,
      courtId: 1,
      date: '2030-12-31',
      startTime: '10:00',
      durationHours: 1,
    });

    expect(() =>
      reservationService.cancelReservation(reservation.id, s2.id, new Date('2030-12-31T06:00:00')),
    ).toThrow(BusinessRuleError);
  });

  it('sugere alternativas próximas', () => {
    const student = createStudent();
    reservationService.createReservation({
      studentId: student.id,
      courtId: 1,
      date: '2026-04-10',
      startTime: '18:00',
      durationHours: 1,
    });

    const alternatives = reservationService.suggestAlternatives('2026-04-10', '18:00', 3);
    expect(alternatives.length).toBeGreaterThan(0);
    const firstTime = alternatives[0].startTime;
    expect(['17:00', '18:00', '19:00']).toContain(firstTime);
  });

  it('lista reservas do aluno', () => {
    const student = createStudent();
    reservationService.createReservation({
      studentId: student.id,
      courtId: 1,
      date: '2030-06-15',
      startTime: '10:00',
      durationHours: 1,
    });
    reservationService.createReservation({
      studentId: student.id,
      courtId: 2,
      date: '2030-06-16',
      startTime: '14:00',
      durationHours: 2,
    });

    const list = reservationService.listStudentReservations(student.id);
    expect(list.length).toBe(2);
    expect(list[0].courtName).toBeDefined();
  });
});
