import { ReservationService } from '../services/reservation.service.js';
import { StudentService } from '../services/student.service.js';
import { CourtService } from '../services/court.service.js';
import { BusinessRuleError } from '../domain/rules.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { toZonedTime } from 'date-fns-tz';

interface ToolInput {
  [key: string]: unknown;
}

export class ToolHandlers {
  private reservationService = new ReservationService();
  private studentService = new StudentService();
  private courtService = new CourtService();

  private getNow(): Date {
    return toZonedTime(new Date(), config.timezone);
  }

  /** Executa uma tool e retorna o resultado como string */
  async handle(toolName: string, input: ToolInput, phone: string): Promise<string> {
    try {
      switch (toolName) {
        case 'consultar_disponibilidade':
          return this.checkAvailability(input);
        case 'fazer_reserva':
          return this.makeReservation(input, phone);
        case 'cancelar_reserva':
          return this.cancelReservation(input, phone);
        case 'reagendar_reserva':
          return this.rescheduleReservation(input, phone);
        case 'minhas_reservas':
          return this.listReservations(input, phone);
        case 'sugerir_alternativas':
          return this.suggestAlternatives(input);
        case 'atualizar_cadastro':
          return this.updateStudent(input, phone);
        case 'escalar_para_humano':
          return this.escalateToHuman(input, phone);
        default:
          return JSON.stringify({ erro: `Ferramenta desconhecida: ${toolName}` });
      }
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        logger.warn({ toolName, input, error: err.message }, 'Regra de negócio violada');
        return JSON.stringify({ erro: err.message });
      }
      logger.error({ toolName, input, error: err }, 'Erro ao executar ferramenta');
      return JSON.stringify({ erro: 'Ocorreu um erro interno. Tente novamente ou fale com a recepção.' });
    }
  }

  private checkAvailability(input: ToolInput): string {
    const date = input.data as string;
    const courtId = input.quadra_id as number | undefined;

    const slots = this.reservationService.checkAvailability(date, courtId);

    if (slots.length === 0) {
      return JSON.stringify({
        disponivel: false,
        mensagem: `Não há horários disponíveis para ${date}.`,
        sugestao: 'Use a ferramenta sugerir_alternativas ou consulte outra data.',
      });
    }

    // Agrupar por quadra
    const byCourtMap = new Map<number, { courtName: string; horarios: string[] }>();
    for (const slot of slots) {
      if (!byCourtMap.has(slot.courtId)) {
        byCourtMap.set(slot.courtId, { courtName: slot.courtName, horarios: [] });
      }
      byCourtMap.get(slot.courtId)!.horarios.push(slot.startTime);
    }

    const byCourt = Array.from(byCourtMap.entries()).map(([courtId, data]) => ({
      quadra_id: courtId,
      quadra_nome: data.courtName,
      horarios_disponiveis: data.horarios,
    }));

    return JSON.stringify({
      disponivel: true,
      data: date,
      quadras: byCourt,
      preco_por_hora: `R$ ${config.center.pricePerHour},00`,
    });
  }

  private makeReservation(input: ToolInput, phone: string): string {
    const student = this.studentService.findOrCreate(phone);

    if (!student.name) {
      return JSON.stringify({
        erro: 'O aluno não tem nome cadastrado. Pergunte o nome antes de fazer a reserva e use a ferramenta atualizar_cadastro.',
      });
    }

    const reservation = this.reservationService.createReservation({
      studentId: student.id,
      courtId: input.quadra_id as number,
      date: input.data as string,
      startTime: input.horario_inicio as string,
      durationHours: input.duracao_horas as number,
    });

    const court = this.courtService.findById(reservation.court_id);
    const totalPrice = (input.duracao_horas as number) * config.center.pricePerHour;

    return JSON.stringify({
      sucesso: true,
      reserva: {
        id: reservation.id,
        quadra: court?.name,
        data: reservation.date,
        horario: `${reservation.start_time} às ${reservation.end_time}`,
        duracao: `${input.duracao_horas}h`,
        valor_total: `R$ ${totalPrice},00`,
        status: 'Confirmada',
        aluno: student.name,
      },
    });
  }

  private cancelReservation(input: ToolInput, phone: string): string {
    const student = this.studentService.findOrCreate(phone);
    const reservation = this.reservationService.cancelReservation(
      input.reserva_id as number,
      student.id,
      this.getNow(),
    );

    const court = this.courtService.findById(reservation.court_id);

    return JSON.stringify({
      sucesso: true,
      mensagem: 'Reserva cancelada com sucesso.',
      reserva_cancelada: {
        id: reservation.id,
        quadra: court?.name,
        data: reservation.date,
        horario: `${reservation.start_time} às ${reservation.end_time}`,
      },
    });
  }

  private rescheduleReservation(input: ToolInput, phone: string): string {
    const student = this.studentService.findOrCreate(phone);
    const newReservation = this.reservationService.rescheduleReservation(
      input.reserva_id as number,
      student.id,
      input.nova_data as string,
      input.novo_horario as string,
      this.getNow(),
    );

    const court = this.courtService.findById(newReservation.court_id);

    return JSON.stringify({
      sucesso: true,
      mensagem: 'Reserva reagendada com sucesso.',
      nova_reserva: {
        id: newReservation.id,
        quadra: court?.name,
        data: newReservation.date,
        horario: `${newReservation.start_time} às ${newReservation.end_time}`,
        status: 'Confirmada',
      },
    });
  }

  private listReservations(input: ToolInput, phone: string): string {
    const student = this.studentService.findOrCreate(phone);
    const includePast = (input.incluir_passadas as boolean) || false;
    const list = this.reservationService.listStudentReservations(student.id, includePast);

    if (list.length === 0) {
      return JSON.stringify({
        reservas: [],
        mensagem: includePast
          ? 'Você não tem nenhuma reserva registrada.'
          : 'Você não tem reservas futuras.',
      });
    }

    return JSON.stringify({
      reservas: list.map((r) => ({
        id: r.id,
        quadra: r.courtName,
        data: r.date,
        horario: `${r.start_time} às ${r.end_time}`,
        status: r.status === 'confirmed' ? 'Confirmada' : 'Cancelada',
      })),
    });
  }

  private suggestAlternatives(input: ToolInput): string {
    const alternatives = this.reservationService.suggestAlternatives(
      input.data as string,
      input.horario_desejado as string,
    );

    if (alternatives.length === 0) {
      return JSON.stringify({
        alternativas: [],
        mensagem: 'Não há horários disponíveis nessa data.',
      });
    }

    return JSON.stringify({
      alternativas: alternatives.map((a) => ({
        quadra_id: a.courtId,
        quadra_nome: a.courtName,
        horario: a.startTime,
      })),
    });
  }

  private updateStudent(input: ToolInput, phone: string): string {
    const student = this.studentService.updateName(phone, input.nome as string);
    return JSON.stringify({
      sucesso: true,
      mensagem: `Cadastro atualizado. Nome: ${student.name}`,
    });
  }

  private escalateToHuman(input: ToolInput, phone: string): string {
    logger.warn({ phone, motivo: input.motivo }, 'Escalonamento para atendente humano');
    return JSON.stringify({
      sucesso: true,
      mensagem:
        'Atendimento transferido para um atendente humano. O aluno será contactado em breve.',
      motivo: input.motivo,
    });
  }
}
