import type Anthropic from '@anthropic-ai/sdk';

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_disponibilidade',
    description:
      'Consulta horários disponíveis para reserva em uma data específica. Retorna lista de slots livres por quadra. Use sempre antes de sugerir horários ao aluno.',
    input_schema: {
      type: 'object' as const,
      properties: {
        data: {
          type: 'string',
          description: 'Data para consulta no formato YYYY-MM-DD',
        },
        quadra_id: {
          type: 'number',
          description: 'ID da quadra específica (opcional — se omitido, consulta todas)',
        },
      },
      required: ['data'],
    },
  },
  {
    name: 'fazer_reserva',
    description:
      'Cria uma nova reserva de quadra. Use SOMENTE após o aluno confirmar explicitamente todos os dados (data, horário, quadra, duração).',
    input_schema: {
      type: 'object' as const,
      properties: {
        data: {
          type: 'string',
          description: 'Data da reserva no formato YYYY-MM-DD',
        },
        horario_inicio: {
          type: 'string',
          description: 'Horário de início no formato HH:MM (ex: 18:00)',
        },
        duracao_horas: {
          type: 'number',
          description: 'Duração em horas (1 ou 2)',
        },
        quadra_id: {
          type: 'number',
          description: 'ID da quadra',
        },
      },
      required: ['data', 'horario_inicio', 'duracao_horas', 'quadra_id'],
    },
  },
  {
    name: 'cancelar_reserva',
    description:
      'Cancela uma reserva existente do aluno. Use somente após confirmação explícita do aluno.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reserva_id: {
          type: 'number',
          description: 'ID da reserva a ser cancelada',
        },
      },
      required: ['reserva_id'],
    },
  },
  {
    name: 'reagendar_reserva',
    description:
      'Reagenda uma reserva existente para nova data/horário. Cancela a reserva atual e cria uma nova.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reserva_id: {
          type: 'number',
          description: 'ID da reserva a reagendar',
        },
        nova_data: {
          type: 'string',
          description: 'Nova data no formato YYYY-MM-DD',
        },
        novo_horario: {
          type: 'string',
          description: 'Novo horário de início no formato HH:MM',
        },
      },
      required: ['reserva_id', 'nova_data', 'novo_horario'],
    },
  },
  {
    name: 'minhas_reservas',
    description: 'Lista as reservas do aluno atual. Útil para o aluno ver suas reservas antes de cancelar ou reagendar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        incluir_passadas: {
          type: 'boolean',
          description: 'Se true, inclui reservas de datas passadas. Padrão: false.',
        },
      },
      required: [],
    },
  },
  {
    name: 'sugerir_alternativas',
    description:
      'Sugere horários alternativos próximos a um horário desejado que não está disponível.',
    input_schema: {
      type: 'object' as const,
      properties: {
        data: {
          type: 'string',
          description: 'Data no formato YYYY-MM-DD',
        },
        horario_desejado: {
          type: 'string',
          description: 'Horário que o aluno queria no formato HH:MM',
        },
      },
      required: ['data', 'horario_desejado'],
    },
  },
  {
    name: 'atualizar_cadastro',
    description: 'Atualiza o nome do aluno no cadastro. Use quando o aluno informar seu nome.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nome: {
          type: 'string',
          description: 'Nome completo do aluno',
        },
      },
      required: ['nome'],
    },
  },
  {
    name: 'escalar_para_humano',
    description:
      'Transfere o atendimento para um atendente humano. Use quando não conseguir resolver, o aluno pedir, ou a situação for delicada.',
    input_schema: {
      type: 'object' as const,
      properties: {
        motivo: {
          type: 'string',
          description: 'Motivo do escalonamento para contexto do atendente',
        },
      },
      required: ['motivo'],
    },
  },
];
