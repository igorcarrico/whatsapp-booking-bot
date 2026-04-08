import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { buildSystemPrompt } from './system-prompt.js';
import { TOOLS } from './tools.js';
import { ToolHandlers } from './tool-handlers.js';
import { StudentService } from '../services/student.service.js';
import { ConversationService } from '../services/conversation.service.js';
import { logger } from '../logger.js';
import { formatInTimeZone } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';

type MessageParam = Anthropic.MessageParam;

export class BookingAssistant {
  private anthropic: Anthropic;
  private toolHandlers = new ToolHandlers();
  private studentService = new StudentService();
  private conversationService = new ConversationService();

  /** Histórico de conversa em memória por telefone */
  private conversations = new Map<string, MessageParam[]>();

  /** Timestamp do último acesso por telefone (para expirar conversas inativas) */
  private lastAccess = new Map<string, number>();

  /** Tempo de expiração de conversa: 30 minutos */
  private readonly CONVERSATION_TTL_MS = 30 * 60 * 1000;

  constructor() {
    if (!config.anthropic.apiKey) {
      logger.warn('ANTHROPIC_API_KEY não configurada — o assistente não funcionará');
    }
    this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey || 'dummy' });
  }

  /** Processa uma mensagem e retorna a resposta do bot */
  async processMessage(phone: string, text: string): Promise<string> {
    const startTime = Date.now();

    // 1. Encontrar ou criar aluno
    const student = this.studentService.findOrCreate(phone);
    logger.info({ phone, studentId: student.id, studentName: student.name }, 'Mensagem recebida');

    // 2. Registrar mensagem de entrada
    this.conversationService.log(phone, 'inbound', text);

    // 3. Obter/criar histórico da conversa
    this.cleanExpiredConversations();
    const history = this.getConversationHistory(phone);

    // 4. Adicionar mensagem do usuário
    history.push({ role: 'user', content: text });

    // 5. Construir system prompt com contexto atual
    const now = formatInTimeZone(
      new Date(),
      config.timezone,
      "EEEE, dd 'de' MMMM 'de' yyyy 'às' HH:mm",
      { locale: ptBR },
    );
    const systemPrompt = buildSystemPrompt(student, now);

    // 6. Loop de tool use
    let response: Anthropic.Message;
    let iterations = 0;
    const maxIterations = 10; // Segurança contra loops infinitos

    try {
      response = await this.anthropic.messages.create({
        model: config.anthropic.model,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: history,
      });

      while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
        iterations++;

        // Extrair tool calls
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        if (toolUseBlocks.length === 0) break;

        // Adicionar resposta do assistente ao histórico
        history.push({ role: 'assistant', content: response.content });

        // Executar cada tool e coletar resultados
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUseBlocks) {
          logger.info(
            { tool: toolUse.name, input: toolUse.input },
            'Executando ferramenta',
          );

          const result = await this.toolHandlers.handle(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            phone,
          );

          logger.debug({ tool: toolUse.name, result }, 'Resultado da ferramenta');

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        // Adicionar resultados como mensagem do usuário
        history.push({ role: 'user', content: toolResults });

        // Chamar Claude novamente
        response = await this.anthropic.messages.create({
          model: config.anthropic.model,
          max_tokens: 1024,
          system: systemPrompt,
          tools: TOOLS,
          messages: history,
        });
      }

      if (iterations >= maxIterations) {
        logger.warn({ phone }, 'Limite de iterações de tool use atingido');
      }
    } catch (err) {
      logger.error({ phone, error: err }, 'Erro ao chamar Claude API');
      const fallbackReply =
        'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes ou entre em contato com a recepção.';
      this.conversationService.log(phone, 'outbound', fallbackReply, {
        error: String(err),
      });
      return fallbackReply;
    }

    // 7. Extrair resposta de texto
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const reply =
      textBlock?.text || 'Desculpe, não consegui processar sua mensagem. Pode reformular?';

    // 8. Adicionar resposta ao histórico
    history.push({ role: 'assistant', content: response.content });

    // 9. Truncar histórico se necessário
    this.trimHistory(phone);

    // 10. Registrar resposta
    this.conversationService.log(phone, 'outbound', reply, {
      model: config.anthropic.model,
      toolCalls: iterations,
      durationMs: Date.now() - startTime,
    });

    logger.info(
      { phone, durationMs: Date.now() - startTime, toolCalls: iterations },
      'Resposta enviada',
    );

    return reply;
  }

  /** Retorna ou cria o histórico de conversa de um telefone */
  private getConversationHistory(phone: string): MessageParam[] {
    this.lastAccess.set(phone, Date.now());
    if (!this.conversations.has(phone)) {
      this.conversations.set(phone, []);
    }
    return this.conversations.get(phone)!;
  }

  /** Mantém o histórico dentro do limite configurado */
  private trimHistory(phone: string): void {
    const history = this.conversations.get(phone);
    if (!history) return;

    const max = config.conversationMaxHistory * 2; // cada troca = 2 mensagens
    if (history.length > max) {
      // Remove mensagens mais antigas, preservando pares user/assistant
      const excess = history.length - max;
      history.splice(0, excess);

      // Garante que o histórico começa com uma mensagem do user
      while (history.length > 0 && history[0].role !== 'user') {
        history.shift();
      }
    }
  }

  /** Remove conversas inativas */
  private cleanExpiredConversations(): void {
    const now = Date.now();
    for (const [phone, lastTime] of this.lastAccess.entries()) {
      if (now - lastTime > this.CONVERSATION_TTL_MS) {
        this.conversations.delete(phone);
        this.lastAccess.delete(phone);
        logger.debug({ phone }, 'Conversa expirada e removida da memória');
      }
    }
  }

  /** Limpa a conversa de um telefone (útil para testes) */
  clearConversation(phone: string): void {
    this.conversations.delete(phone);
    this.lastAccess.delete(phone);
  }
}
