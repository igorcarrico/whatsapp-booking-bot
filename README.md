# Arena Beach Bot

Chatbot WhatsApp para reservas de quadras de areia, powered by Claude AI.

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────┐
│  WhatsApp   │────▶│   Webhook    │────▶│   Assistant    │────▶│  Claude  │
│  Business   │◀────│  (Fastify)   │◀────│  (Tool Loop)  │◀────│   API    │
│  Cloud API  │     └──────────────┘     └───────┬───────┘     └──────────┘
└─────────────┘                                  │
                                          ┌──────┴──────┐
                                          │ Tool        │
                                          │ Handlers    │
                                          └──────┬──────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    │            │            │
                              ┌─────┴──┐  ┌─────┴───┐  ┌────┴─────┐
                              │Student │  │Reserva- │  │  Court   │
                              │Service │  │tion Svc │  │ Service  │
                              └────┬───┘  └────┬────┘  └────┬─────┘
                                   │           │            │
                                   └───────────┼────────────┘
                                               │
                                        ┌──────┴──────┐
                                        │   SQLite    │
                                        │  (Drizzle)  │
                                        └─────────────┘
```

**Abordagem:** Claude API com Tool Use (não agentes). O LLM interpreta a intenção, extrai entidades e chama ferramentas determinísticas para executar ações no banco de dados.

## Pré-requisitos

- Node.js 20+
- Chave de API do Anthropic (Claude)

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env e adicione sua ANTHROPIC_API_KEY

# 3. Popular banco com quadras iniciais
npm run seed

# 4. Iniciar em modo desenvolvimento
npm run dev
```

## Uso Local (sem WhatsApp)

O endpoint `/chat` permite testar sem integração com WhatsApp:

```bash
# Primeira mensagem — bot vai pedir o nome
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999990000", "message": "Oi, quero reservar uma quadra"}'

# Informar nome
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999990000", "message": "Meu nome é João Silva"}'

# Pedir horário
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999990000", "message": "Quero reservar amanhã às 18h, 1 hora"}'

# Confirmar reserva
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999990000", "message": "Pode confirmar na Beach 1"}'

# Consultar reservas
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999990000", "message": "Quais são minhas reservas?"}'

# Cancelar
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999990000", "message": "Quero cancelar minha reserva"}'
```

## Integração com WhatsApp

### 1. Criar App no Meta for Developers

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Crie um novo App do tipo "Business"
3. Adicione o produto "WhatsApp"
4. Obtenha:
   - **Access Token** (temporário para teste, permanente para produção)
   - **Phone Number ID**
   - **Verify Token** (você define)

### 2. Configurar Webhook

1. Exponha o servidor na internet (use [ngrok](https://ngrok.com) para desenvolvimento):
   ```bash
   ngrok http 3000
   ```
2. No painel do Meta, configure o webhook:
   - **URL:** `https://seu-dominio.ngrok.io/webhook`
   - **Verify Token:** o mesmo do `.env`
   - **Campos:** `messages`

### 3. Variáveis de ambiente

```env
WHATSAPP_VERIFY_TOKEN=seu_token_de_verificacao
WHATSAPP_ACCESS_TOKEN=seu_access_token_do_meta
WHATSAPP_PHONE_NUMBER_ID=seu_phone_number_id
```

## Testes

```bash
npm test
```

## Estrutura do Projeto

```
src/
├── config.ts                  # Configuração centralizada (env + defaults)
├── logger.ts                  # Logger (pino)
├── index.ts                   # Entry point
├── server.ts                  # Fastify server
├── domain/
│   └── rules.ts               # Tipos, regras de negócio, validações
├── database/
│   ├── schema.ts              # Schema Drizzle ORM
│   ├── connection.ts          # Conexão SQLite + criação de tabelas
│   └── seed.ts                # Dados iniciais (quadras)
├── services/
│   ├── student.service.ts     # CRUD de alunos
│   ├── court.service.ts       # Consulta de quadras
│   ├── reservation.service.ts # Lógica de reservas (core)
│   └── conversation.service.ts # Log de conversas
├── ai/
│   ├── system-prompt.ts       # Prompt do sistema para Claude
│   ├── tools.ts               # Definições de ferramentas
│   ├── tool-handlers.ts       # Execução das ferramentas
│   └── assistant.ts           # Orquestrador (loop de tool use)
└── whatsapp/
    ├── types.ts               # Tipos da API do WhatsApp
    ├── client.ts              # Cliente para enviar mensagens
    └── webhook.ts             # Webhook + endpoint /chat
```

## Fluxos de Conversa

### Reserva completa
```
Aluno: Oi, quero reservar uma quadra
Bot:   Olá! Vou te ajudar com a reserva. Qual é o seu nome?
Aluno: João Silva
Bot:   Prazer, João! Para qual data e horário você gostaria de reservar?
Aluno: Amanhã às 18h
Bot:   Encontrei disponibilidade para amanhã (08/04) às 18h:
       • Beach 1 (Beach Tennis)
       • Beach 2 (Beach Tennis)
       • Beach 3 (Futevôlei)
       Qual quadra você prefere? E a duração será 1h ou 2h?
Aluno: Beach 1, 1 hora
Bot:   Confirmo a reserva:
       📋 Beach 1 | 08/04 | 18:00 às 19:00 | 1h | R$ 120,00
       Posso confirmar?
Aluno: Sim!
Bot:   Reserva confirmada! ✅
       ID: #42 | Beach 1 | 08/04 às 18:00-19:00
       Bom jogo, João!
```

### Horário indisponível
```
Aluno: Quero reservar a Beach 1 amanhã às 18h
Bot:   Infelizmente a Beach 1 está ocupada amanhã às 18h.
       Alternativas próximas:
       • Beach 2 às 18:00
       • Beach 1 às 17:00
       • Beach 1 às 19:00
       Alguma dessas funciona para você?
```

### Cancelamento
```
Aluno: Preciso cancelar minha reserva
Bot:   Suas reservas ativas:
       1. #42 — Beach 1 | 08/04 | 18:00-19:00
       2. #43 — Beach 3 | 10/04 | 20:00-21:00
       Qual deseja cancelar?
Aluno: A primeira
Bot:   Confirmo o cancelamento da reserva #42 (Beach 1, 08/04 às 18h)?
Aluno: Sim
Bot:   Reserva #42 cancelada com sucesso.
```

## Configuração do Centro Esportivo

Todas as configurações ficam em variáveis de ambiente (`.env`):

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `CENTER_NAME` | Arena Beach | Nome do centro |
| `CENTER_ADDRESS` | Rua das Quadras, 100 | Endereço |
| `CENTER_OPEN_TIME` | 06:00 | Abertura |
| `CENTER_CLOSE_TIME` | 22:00 | Fechamento |
| `CENTER_PRICE_PER_HOUR` | 120 | Preço por hora |

Para alterar quadras, edite o arquivo `src/database/seed.ts` e rode `npm run seed`.

## Limitações Atuais

- **Apenas mensagens de texto**: áudio, imagem e vídeo são ignorados
- **Sem pagamento online**: pagamento é feito presencialmente
- **Sem recorrência**: reservas fixas semanais precisam ser feitas individualmente
- **Sem painel admin web**: gestão via banco de dados ou API REST
- **Single-tenant**: uma instância por centro esportivo

## Próximos Passos

1. **Painel administrativo web** — React/Next.js para gestão de quadras, reservas e alunos
2. **Pagamento online** — Integração com Stripe/Mercado Pago
3. **Notificações** — Lembretes automáticos 1h antes da reserva
4. **Reservas recorrentes** — "Todo sábado às 10h"
5. **Mensagens de áudio** — Transcrição com Whisper
6. **Multi-tenant** — Suporte a múltiplos centros esportivos
7. **Métricas** — Dashboard de uso, taxa de ocupação, horários de pico
8. **Deploy** — Docker + Railway/Fly.io para produção
