import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_PATH: z.string().default('./data/arena.db'),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  WHATSAPP_VERIFY_TOKEN: z.string().default('arena-bot-verify-token'),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  CENTER_NAME: z.string().default('Arena Beach'),
  CENTER_ADDRESS: z.string().default('Rua das Quadras, 100 - São Paulo/SP'),
  CENTER_PHONE: z.string().default('(11) 99999-0000'),
  CENTER_OPEN_TIME: z.string().default('06:00'),
  CENTER_CLOSE_TIME: z.string().default('22:00'),
  CENTER_PRICE_PER_HOUR: z.coerce.number().default(120),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Erro na configuração:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  const env = parsed.data;

  return {
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databasePath: env.DATABASE_PATH,
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
    },
    whatsapp: {
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    },
    timezone: 'America/Sao_Paulo' as const,
    center: {
      name: env.CENTER_NAME,
      address: env.CENTER_ADDRESS,
      phone: env.CENTER_PHONE,
      openTime: env.CENTER_OPEN_TIME,
      closeTime: env.CENTER_CLOSE_TIME,
      pricePerHour: env.CENTER_PRICE_PER_HOUR,
      minDurationHours: 1,
      maxDurationHours: 2,
      cancellationDeadlineHours: 2,
      modalities: ['Beach Tennis', 'Futevôlei', 'Vôlei de Praia'],
    },
    conversationMaxHistory: 20,
  } as const;
}

export type AppConfig = ReturnType<typeof loadConfig>;
export const config = loadConfig();
