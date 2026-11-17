# Arquitetura da Isabelle Wallet

## Visão geral

```
Navegador (React 19, client components)
   │  formulários (React Hook Form + Zod)        gráficos (Recharts)
   ▼
Next.js 16 (App Router) — servidor
   ├─ src/proxy.ts ............ proteção de rotas + renovação de sessão Supabase
   ├─ src/app/(app)/**/page.tsx  Server Components: carregam dados e calculam
   ├─ src/server/actions/*.ts .. Server Actions: autenticação → validação Zod → banco (RLS)
   ├─ src/app/api/export ....... download de CSV e backup (rota autenticada)
   ├─ src/server/services ...... snapshot/sincronização, câmbio, IA, backup
   ├─ src/server/auth .......... Supabase Auth ou autenticação local (scrypt + JWT)
   └─ src/server/db ............ conexão + transação por usuária com RLS
   ▼
PostgreSQL (Supabase em produção · PGlite embutido no modo local)
   └─ mesma migration, mesmas políticas de Row Level Security
```

### Camadas

| Camada | Pasta | Responsabilidade |
|---|---|---|
| Interface | `src/app`, `src/components` | Páginas, formulários, gráficos, navegação |
| Regras financeiras | `src/lib/finance` | Funções puras (sem I/O): saldos, recorrência, contas, planner, dívida, fluxo de caixa, orçamento, metas, relatórios, assistente |
| Validação | `src/lib/validation.ts` | Esquemas Zod compartilhados por formulários e Server Actions |
| Serviços | `src/server/services` | Carregar/sincronizar dados, câmbio externo, IA, backup |
| Banco | `src/server/db`, `supabase/migrations` | Conexão, migrations, transações com papel `authenticated` |
| Autenticação | `src/server/auth`, `src/proxy.ts` | Sessão, login, cadastro, troca de senha |
| Integrações externas | `services/fx.ts`, `services/ai.ts` | Provedor de câmbio e API de IA — sempre no servidor |

### Fluxo de uma página

1. `proxy.ts` confirma que existe sessão válida (senão → `/login`).
2. `getAppData()` (cacheado por requisição) verifica a sessão de novo, abre **uma transação como a usuária** (`set local role authenticated` + `request.jwt.claims`), sincroniza o que está agendado (vencimentos futuros, acréscimos semestrais, juros) e carrega tudo.
3. `analyze(snapshot)` calcula saldos, insights, notificações etc. no servidor.
4. A página envia ao cliente apenas dados serializáveis (sem segredos).

### Fluxo de uma ação

`Server Action` → `requireUserForAction()` → `schema.safeParse()` → `withUser(userId, …)` (RLS) → `refresh()` → mensagem amigável. Erros de banco viram mensagens genéricas; logs não contêm valores financeiros.

## Banco de dados

Todas as tabelas têm `user_id` (padrão `auth.uid()`), RLS **habilitado e forçado**, e uma
política única "só a dona". O papel `anon` não tem acesso. Chaves estrangeiras compostas
`(id, user_id)` impedem que um registro aponte para dados de outra pessoa.

| Tabela | Conteúdo | Relações |
|---|---|---|
| `profiles` | moeda principal, fuso, tema, reserva mínima, alertas, IA | 1:1 `auth.users` |
| `accounts` | contas (corrente, poupança, dinheiro, cartão…) com saldo inicial | — |
| `incomes` | fontes de renda (regras de recorrência), datas puladas | → `accounts` |
| `transactions` | livro-razão: receitas, despesas (pagas/pendentes), reembolsos, transferências, pagamentos de dívida | → `accounts` (origem/destino), `incomes`, `subscriptions`, `debts`, `transactions` (reembolso) |
| `bills` | contas a pagar (valor, mínimo, prioridade, multa, juros, parcial) | → `accounts` |
| `bill_occurrences` | cada vencimento de uma conta | → `bills` |
| `bill_payments` | pagamentos de um vencimento | → `bill_occurrences`, `transactions` |
| `subscriptions` | assinaturas, ciclo, próxima cobrança, uso | → `accounts` |
| `debts` | dívida universitária: saldo inicial, acréscimo, intervalo, término, juros, plano | — |
| `debt_events` | histórico: acréscimos, juros, pagamentos, ajustes | → `debts`, `transactions` |
| `goals` | metas | — |
| `goal_contributions` | contribuições/retiradas | → `goals` |
| `budgets` | limite mensal por categoria | — |
| `fx_rates` | cotações (fonte, data, horário, manual) | — |

Restrições importantes no banco: só despesas podem ser pendentes; movimentações pagas
exigem conta; transferência exige contas diferentes; um recebimento por ocorrência de
receita; hash de importação único; um acréscimo/juro automático por data.

## Modo local × Supabase

| | Local (padrão sem configuração) | Supabase (produção) |
|---|---|---|
| Banco | PGlite (PostgreSQL em WebAssembly) em `.data/pglite` | Postgres do Supabase via `DATABASE_URL` (pooler) |
| Auth | e-mail + senha, scrypt, JWT HS256 em cookie httpOnly; bloqueio após 5 tentativas | Supabase Auth (cookies via `@supabase/ssr`) |
| RLS | mesmas políticas; `auth.uid()` emulado lendo `request.jwt.claims` | nativo |
| Migrations | aplicadas automaticamente na inicialização | `npm run db:migrate` |

## Integrações futuras (bancos)

A importação já separa **leitura → normalização → validação no servidor → detecção de
duplicadas → gravação em transação**, com `import_hash` para idempotência. Um conector
bancário futuro pode produzir as mesmas linhas normalizadas e reutilizar `commitImport`,
sempre opcional e com autorização explícita da usuária. O app nunca executa pagamentos.
