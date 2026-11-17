# Isabelle Wallet

Plataforma pessoal, privada e inteligente de controle financeiro — com identidade visual
rosa, modo escuro, interface responsiva e cálculos financeiros precisos e testados.

> A Isabelle Wallet **organiza, calcula e recomenda**. Ela nunca realiza pagamentos ou
> movimenta dinheiro de verdade.

## O que tem

| Módulo | Destaques |
|---|---|
| **Dashboard** | saldo disponível, recebido/gasto no mês, contas pendentes, já pago, dívida, economia, “quanto ainda posso gastar”, próximas contas, receitas × despesas, evolução do patrimônio e “Seu resumo financeiro” calculado dos seus dados |
| **Contas & saldos** | contas em USD/BRL, saldo inicial, transferências (não contam como receita/despesa) |
| **Receitas** | fontes únicas e recorrentes (semanal, quinzenal, mensal, semestral, anual, personalizada), confirmação de recebimento, projeção de 6 meses |
| **Despesas** | cadastro completo, pesquisa, filtros (período, categoria, valor, status), pendente/pago/atrasado, recorrentes, reembolsos, comparação entre meses, aumentos incomuns, gráficos |
| **Bills & Payments** | vencimentos de hoje / 7 / 30 dias / atrasados, pagamento parcial, multa e juros, e o **Smart Payment Planner** (ordem recomendada, reservas, maior risco, simulação e registro) |
| **University Debt Manager** | acréscimo semestral configurável (5.500 por padrão) lançado na data certa, juros opcionais, histórico detalhado, simulador (100/200/300/500/personalizado), estratégias Conservative/Balanced/Aggressive, projeção de 6 meses a 5 anos, alerta de pagamento insuficiente |
| **Monthly Budget** | limites por categoria, dentro/próximo/ultrapassado, projeção do mês, recomendações |
| **Cash Flow Forecast** | linha do tempo diária/semanal/mensal, saldo real × previsto, simulações “e se…?” |
| **Savings Goals** | metas, progresso, estimativas, quanto guardar por meta |
| **Assinaturas** | mensal/anual, próximas cobranças, “quero cancelar”, uso só com dados reais |
| **Calendário** | recebimentos, vencimentos, pagamentos, acréscimos da faculdade, metas, por cores |
| **Financial Reports** | mensal, trimestral, semestral, anual e personalizado; CSV e PDF |
| **Isabelle Intelligence** | perguntas em linguagem natural respondidas pelo motor financeiro (problema, ação, impacto, riscos, premissas, dados faltando); IA opcional no servidor |
| **Importar & backup** | CSV com pré-visualização, linhas inválidas e duplicadas; backup JSON e restauração atômica |
| **Configurações** | perfil, moeda principal, fuso, tema, reserva mínima, alertas, câmbio (automático e manual), senha, apagar dados |

Detalhes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/FINANCIAL_RULES.md](docs/FINANCIAL_RULES.md)

## Tecnologias

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · Radix UI ·
Recharts · Lucide · React Hook Form + Zod · date-fns · decimal.js · Supabase (Auth + Postgres + RLS) ·
PGlite (Postgres embutido para uso local) · jsPDF · Vitest · SDK oficial da Anthropic (IA opcional).

## Executar localmente (sem nenhuma conta na nuvem)

Requisitos: **Node.js 20.9+** (testado com Node 24).

```bash
npm install
```

```bash
npm run dev
```

Abra http://localhost:3000, clique em **Criar conta** e siga a configuração inicial.

No modo local os dados ficam em `.data/pglite` (banco PostgreSQL real, embutido) e o
primeiro cadastro vira a dona da carteira — novos cadastros ficam bloqueados por padrão.
Para começar do zero, pare o servidor e apague a pasta `.data`.

## Configurar o Supabase (recomendado para publicar)

1. Crie um projeto em https://supabase.com.
2. Copie `.env.example` para `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — *Project Settings → API*.
   - `DATABASE_URL` — *Project Settings → Database → Connection string → Transaction pooler* (porta 6543), com a senha do banco. **É um segredo.**
   - `DATA_BACKEND=supabase`
3. Crie as tabelas e políticas de segurança:

   ```bash
   npm run db:migrate
   ```

   (Alternativa: cole `supabase/migrations/20261116000000_initial_schema.sql` no *SQL Editor* do Supabase.)
4. Em *Authentication → URL Configuration*, defina **Site URL** com o endereço do app e adicione `https://SEU-DOMINIO/auth/callback` (e `http://localhost:3000/auth/callback`) em *Redirect URLs*.
5. Rode `npm run dev`, crie sua conta e confirme pelo e-mail.
6. Depois de criar a sua conta, desative novos cadastros: *Authentication → Providers → Email → Allow new users to sign up* (desligado) e/ou `ALLOW_SIGNUP=false`.

Como funciona a segurança: o servidor conecta ao Postgres e, em **cada transação**, troca
para o papel `authenticated` com o ID da usuária da sessão. As políticas de RLS garantem
que cada consulta só enxergue as linhas dela — inclusive se houver um bug no código.

## Câmbio (USD ↔ BRL)

Funciona sem chave: por padrão usa o **Frankfurter** (taxas de referência do Banco Central
Europeu). A cotação é atualizada automaticamente a cada 12 h ao abrir o app, ou pelo botão
**Atualizar** em *Configurações → Câmbio*, onde também é possível informar uma **taxa manual**.
Se o provedor estiver fora do ar, a última cotação conhecida continua em uso, com data e
horário. Para usar a AwesomeAPI: `FX_PROVIDER=awesomeapi`.

## IA (opcional)

A Isabelle Intelligence funciona sem IA: todas as respostas vêm do motor financeiro.
Para adicionar explicações em linguagem natural:

1. Crie uma chave em https://console.anthropic.com e defina `AI_API_KEY` (apenas no servidor).
2. Opcional: `AI_MODEL` (padrão `claude-opus-5-5`).
3. Ative em *Configurações → Usar IA*.

Quando ativada, só é enviado um resumo dos números necessários à pergunta, no momento em
que você pergunta. O modelo recebe a resposta calculada como fonte da verdade e é instruído
a não inventar valores. O fallback de recusa do servidor (`fallbacks: "default"`) está habilitado.

## Testes

```bash
npm test
```

60 testes cobrem: dinheiro e arredondamento, datas e fusos, recorrências, câmbio, CSV,
saldos (transferências, pendentes, reembolsos, pagamentos de dívida), contas e pagamentos
parciais, Smart Payment Planner, acréscimos semestrais, juros, simulador e estratégias da
dívida, fluxo de caixa, orçamento, metas, assinaturas, assistente, relatórios, **isolamento
entre usuárias via RLS em PostgreSQL real**, sincronização sem duplicação e backup/restauração.

```bash
npm run typecheck
```

## Publicar (Vercel)

1. Configure o Supabase (seção acima) e rode `npm run db:migrate` apontando para ele.
2. Importe o repositório na Vercel.
3. Variáveis de ambiente: `DATA_BACKEND=supabase`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL` e, se quiser, `AI_API_KEY`.
4. Deploy. Atualize *Site URL* e *Redirect URLs* do Supabase com o domínio final.

Self-hosting (VPS/Docker): `npm run build` e `npm start` atrás de HTTPS. No modo local em
produção, defina `AUTH_SECRET` (≥ 32 caracteres), mantenha `LOCAL_DATA_DIR` em disco
persistente e rode **uma única instância** (o banco embutido não é compartilhado entre processos).

## Segurança e privacidade

- Rotas protegidas no `proxy.ts` **e** verificação de sessão em cada página, ação e rota de API.
- RLS forçado em todas as tabelas; `anon` sem acesso; FKs compostas impedem referências cruzadas.
- Senhas nunca em texto puro (Supabase Auth ou scrypt); bloqueio após tentativas falhas.
- Validação com Zod no navegador **e** no servidor; textos sanitizados; CSV exportado protegido contra injeção de fórmulas.
- Segredos só em variáveis de ambiente do servidor; nenhuma chave privada no frontend.
- Headers: CSP, `X-Frame-Options: DENY`, `noindex`, `Referrer-Policy`, `Permissions-Policy`.
- Logs sem valores financeiros (inclusive o log de Server Functions do Next está desativado).

## Estrutura

```
src/
  app/            páginas (App Router), rotas de API e autenticação
  components/     UI (primitivos, formulários, gráficos, layout)
  lib/finance/    motor financeiro puro (testado)
  lib/            validação, formatação, constantes
  server/         auth, banco, serviços, Server Actions
supabase/migrations/   schema + RLS (usado no Supabase e no modo local)
scripts/migrate.ts     aplica migrations em DATABASE_URL
tests/                 Vitest
docs/                  arquitetura e regras financeiras
```
