# Brida Coiffeur

SaaS de marcações para cabeleireiro e barbearia: portal do cliente, painel administrativo,
agente de IA para marcações, sinal pago pela Stripe e avisos por WhatsApp.

**Stack:** Next.js 15 (App Router, Server Actions, TypeScript) · Tailwind CSS 4 + shadcn/ui ·
Supabase (Postgres, RLS, Auth, Realtime, Storage) · Stripe · OpenAI (gpt-4o-mini) ·
Twilio ou Evolution API.

## Estado

| Passo | O quê | Estado |
|---|---|---|
| 1 | Estrutura de pastas Next.js | ✅ |
| 2 | `supabase/schema.sql` (tabelas, enums, RLS, RPCs, triggers, views, realtime, storage) | ✅ validado |
| 3 | `types/database.ts` | ✅ validado contra o supabase-js |
| 4 | Server Actions de agendamento (`actions/agenda.ts`: mês, horários, marcar) | ✅ (modo demonstração sem Supabase) |
| 5 | Interface (landing, /agendar, /perfil, /admin/*) | ⏳ páginas provisórias |
| 6a | Chat de IA (`/api/ai/chat` + `<AiBookingWidget />`) | ✅ falta testar com chaves reais |
| 6b | WhatsApp Business da Meta (`/api/webhooks/whatsapp`) | 🟡 pronto; falta pôr as credenciais no painel → Automação |
| 7 | Painel do gerente (endereço secreto) | ✅ 9 separadores |
| 6c | Webhook Stripe | ⏸ fora do fluxo de marcação (sem pagamentos online) |

## Estrutura

```
brida-coiffeur/
├── app/
│   ├── layout.tsx                 fontes (Cormorant Garamond + Jost) e metadata
│   ├── globals.css                Tailwind 4 + tokens shadcn (carvão + champanhe)
│   ├── (site)/                    portal do cliente
│   │   ├── page.tsx               landing: hero, serviços, antes/depois, sobre, opiniões, AGENDA, contacto
│   │   ├── agendar/               passo-a-passo: serviços → profissional → horário → produtos → confirmação
│   │   ├── perfil/                próximos/histórico, reagendar/cancelar, cartão fidelidade + QR
│   │   └── entrar/                login (magic link / telefone)
│   ├── admin/                     painel (só staff/admin — ver middleware)
│   │   ├── agenda/                dia/semana por profissional, drag and drop, bloqueios
│   │   ├── clientes/[id]/         CRM, notas técnicas, pontos, atalho WhatsApp
│   │   ├── financeiro/            faturação, comissões, gorjetas, gráficos
│   │   ├── cms/                   serviços, preços, horários, galeria, descontos
│   │   └── fila-espera/           fila de desistências + disparo WhatsApp
│   ├── api/
│   │   ├── ai/chat/               agente de marcação (function calling)
│   │   └── webhooks/whatsapp/     respostas SIM/NÃO + agente de IA (aguarda API)
│   └── auth/callback/             troca do code do magic link pela sessão
├── actions/                       Server Actions (passo 4)
├── components/
│   ├── ui/                        componentes shadcn (npx shadcn add …)
│   ├── site/ booking/ profile/    portal do cliente
│   ├── agenda/                    agenda de papel com carimbos (Agenda.tsx, Stamp.tsx)
│   ├── admin/                     NotificationBar, agenda, tabelas
│   └── ai/AiBookingWidget.tsx     chat flutuante do site
├── lib/
│   ├── supabase/{client,server,admin,middleware}.ts
│   ├── ai/{agent,tools}.ts        agente (gpt-4o-mini + function calling), usado no site e no WhatsApp
│   ├── whatsapp.ts                confirmações e adaptador do fornecedor (em aberto)
│   ├── phone.ts / rate-limit.ts
│   ├── format.ts                  dinheiro/datas pt-PT, link wa.me
│   └── utils.ts                   cn()
├── middleware.ts                  renova a sessão e protege /perfil e /admin
├── types/database.ts              tipos da base + rótulos e mensagens de erro em pt
└── supabase/
    ├── schema.sql                 schema completo
    ├── seed.sql                   dados do Brida Coiffeur By Claudia Rocha
    └── check-schema.mjs           valida o schema num Postgres local (PGlite)
```

## Configurar

### Em desenvolvimento (já funciona sem nada)
`npm install` e `npm run dev` → http://localhost:3240. Sem `DATABASE_URL`, a app cria uma base
Postgres local em `.data/pg` com o schema e os dados do salão. Para recomeçar do zero: parar o
servidor, apagar `.data/`, arrancar de novo.

O `.env.local` (gerado, **não publicar**) tem o endereço secreto do painel (`MANAGER_PATH`), a senha
(`MANAGER_PASSWORD`), a chave de cifra (`DATA_ENCRYPTION_KEY`) e o `CRON_SECRET`.
**Área do gerente:** 3 toques rápidos no ponto final de "cabelo." no título da página inicial.

### Ligar ao Supabase (produção)
1. Criar o projeto no Supabase (região Europa, ex.: Frankfurt/Paris).
2. **SQL Editor** → correr `supabase/schema.sql` e depois `supabase/seed.sql`.
   (NUNCA correr `local-shim.sql` no Supabase.)
3. **Project Settings → Database → Connection string (Session pooler)** → copiar para `DATABASE_URL`.
4. Em produção definir também: `MANAGER_PATH`, `MANAGER_PASSWORD` (forte, nova), `MANAGER_SESSION_SECRET`,
   `DATA_ENCRYPTION_KEY`, `CRON_SECRET`, `OPENAI_API_KEY`, `NEXT_PUBLIC_SITE_URL`.
   As chaves `NEXT_PUBLIC_SUPABASE_*` só são precisas quando ligarmos o login de clientes (/perfil).
5. Painel → Editar site: preços e durações reais; Automação: WhatsApp Business e Telegram.

`npm run db:check` aplica o schema num Postgres em memória e corre 35 verificações (agenda, sobreposição,
RLS por papel, dados fechados ao público, fidelidade, comissões).

## Segurança

| Camada | O que protege |
|---|---|
| Base só no servidor | O browser nunca fala com a base: tudo passa por Server Actions/rotas `server-only`. A `DATABASE_URL` não vai para o browser. |
| Supabase RLS + `revoke` | Mesmo com a chave pública (anon) da API do Supabase, **nenhuma** tabela com dados de clientes é legível. Notas do gerente e credenciais nem por utilizadores autenticados. Testado em `db:check`. |
| Respostas mínimas | O site público só recebe horários livres e o resumo da marcação de quem marcou. Encontrar uma ficha pelo telefone nunca devolve o nome guardado. |
| Painel secreto | Endereço só revelado pelo servidor (3 toques no ponto); `/painel` direto dá 404; `noindex`; senha com limite de 5 tentativas/15 min; sessão em cookie `httpOnly` + `SameSite=Strict` assinado com HMAC. Todas as ações do painel verificam a sessão. |
| Tokens cifrados | WhatsApp/Telegram guardados com AES-256-GCM (`DATA_ENCRYPTION_KEY`); o painel só mostra os últimos 4 caracteres. |
| Cabeçalhos HTTP | CSP restrita, `X-Frame-Options: DENY`, `nosniff`, HSTS (produção), `Permissions-Policy`, sem `X-Powered-By`, sem source maps no browser. |
| Abuso | Limites por IP no chat, na agenda e na revelação do painel; armadilha anti-bot no formulário; webhook do WhatsApp valida a assinatura da Meta; cron exige `CRON_SECRET`. |

## Decisões do modelo de dados

- **Ficha de cliente ≠ conta.** `profiles.id` é independente de `auth.users`; `profiles.user_id`
  liga as duas. Assim o salão cria fichas no CRM (ou a IA/WhatsApp cria-as) para quem nunca se
  registou. Quando a pessoa cria conta e **confirma** o email ou telefone, a conta é ligada à ficha
  existente. Só o canal confirmado conta, para ninguém herdar o histórico de outra pessoa.
- **Sem marcações sobrepostas, garantido pela base:** `exclusion constraint` sobre
  `(staff_id, tstzrange(start_time, end_time))` para estados ativos. Duas marcações simultâneas no
  mesmo horário: uma passa, a outra recebe `SLOT_UNAVAILABLE`.
- **Regras de marcação num só sítio:** `get_available_slots`, `book_appointment`,
  `cancel_appointment` e `reschedule_appointment` são funções SQL. O `/agendar`, o `/perfil`, o
  agente de IA e o painel chamam as mesmas funções. Os clientes não têm UPDATE direto em
  `appointments`.
- **Confirmação por WhatsApp, sem pagamento online.** Marcações do site/IA nascem `pending`
  (sem prazo) e o painel recebe "Nova marcação por confirmar". O cliente confirma:
  - *sem API (já funciona):* botão **Confirmar no WhatsApp** abre uma conversa com o salão com
    `CONFIRMAR a marcação #CÓDIGO` escrito; o salão confirma no painel;
  - *com API:* o salão envia o pedido, o cliente responde **SIM**/**NÃO** e o webhook confirma ou
    cancela sozinho (só se o número coincidir com o da marcação). Marcações feitas na própria
    conversa do WhatsApp ficam logo confirmadas (o número já está provado).
- **Sinal (desligado por omissão):** % configurável (`salon_settings.deposit_percent`, por omissão 20%) sobre o preço já com
  desconto, ou valor fixo por serviço (`services.deposit_amount`), com mínimo `min_deposit`.
  A marcação nasce `pending` com `hold_expires_at` (15 min por omissão). Se o sinal não for pago a
  tempo, o horário fica livre outra vez. O webhook da Stripe passa-a a `confirmed`.
- **Add-ons:** `appointments.service_id` é o serviço principal; todos os serviços (principal + add-ons)
  ficam em `appointment_services` com preço e duração congelados.
- **Fidelidade:** `loyalty_transactions` é o livro-razão e `profiles.loyalty_points` o saldo
  mantido por trigger. Concluir um atendimento dá pontos uma única vez. O QR Code do cartão
  codifica `profiles.loyalty_code`.
- **Painel em tempo real:** triggers escrevem em `admin_events` (novo agendamento confirmado,
  cancelamento, reagendamento, fila de espera, avaliação, venda); a `<NotificationBar />` subscreve
  essa tabela pelo Realtime.
- **Horas:** tudo em `timestamptz`; o dia e a hora locais saem de `salon_settings.timezone`
  (por omissão `Europe/Lisbon`, moeda EUR).
- **Horários iniciais** (`business_hours`): ter–qui 9h–19h, sex 9h–20h, sáb 9h–18h, dom/seg fechado.
  São valores provisórios, para editar no CMS.
