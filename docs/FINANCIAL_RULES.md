# Regras financeiras da Isabelle Wallet

Este documento descreve **como cada número é calculado**. Todas as regras vivem no
motor financeiro puro em `src/lib/finance/` (sem acesso a banco ou rede) e são
cobertas por testes em `tests/`.

## 1. Representação de valores

| Item | Regra |
|---|---|
| Dinheiro no banco | `numeric(14,2)` — decimal exato |
| Dinheiro no código | inteiros em **centavos** (`Cents`), somas e subtrações exatas |
| Taxas (juros, câmbio) | `decimal.js`, arredondamento **meio para longe do zero**, uma única vez, para centavos |
| Datas | `date` sem hora (`"AAAA-MM-DD"`), aritmética em UTC; "hoje" é resolvido no **fuso horário da usuária** |
| Moedas | USD e BRL. Valores de moedas diferentes **nunca** são somados sem conversão explícita |

## 2. Saldo real × saldo projetado

- **Saldo real** de uma conta = saldo inicial + movimentações **pagas/recebidas** a partir da data do saldo inicial.
- Movimentações com data **anterior** ao saldo inicial são histórico (já estão no saldo inicial) e não alteram o saldo de novo.
- **Despesa pendente não é pagamento**: não reduz o saldo real até ser marcada como paga.
- **Receita futura não é dinheiro disponível**: só entra no saldo quando o recebimento é confirmado.
- **Saldo projetado** (Cash Flow) parte do saldo real de hoje e soma/subtrai eventos previstos, sempre rotulados como previsão.

## 3. Tipos de movimentação

| Tipo | Efeito na conta | Conta como receita? | Conta como despesa? |
|---|---|---|---|
| `income` | + | sim | — |
| `expense` (paga) | − | — | sim |
| `expense` (pendente) | nenhum | — | compromisso (orçamento) |
| `refund` | + | — | reduz a despesa da categoria |
| `transfer` | − origem, + destino | **não** | **não** |
| `debt_payment` | − | — | saída de dinheiro (separada de "despesas"), **e** reduz a dívida |

- Um pagamento de dívida gera **uma** transação (saída) e **um** evento de dívida vinculado — cada livro conta a operação uma única vez. Apagar a transação apaga o evento.
- Pagamento de conta (Bills) gera uma despesa paga vinculada ao vencimento.
- Transferências entre moedas guardam o valor que saiu (moeda de origem) e o que entrou (moeda de destino).
- Prevenção de duplicidade: um recebimento por ocorrência de receita (`unique`), hash de importação único, ocorrências de conta únicas por data, acréscimos automáticos únicos por data.

## 4. Câmbio

- Cotações vêm do provedor configurado (padrão: Frankfurter/BCE) e são salvas com data, horário e fonte.
- Taxa em uso = a mais recentemente atualizada (automática ou manual).
- Movimentações históricas usam a taxa da data (ou a mais próxima); saldos atuais usam a última taxa.
- Se não houver cotação, o valor fica **fora** dos totais e o app avisa — nunca usa taxa inventada.
- Ao registrar em uma conta de outra moeda, o valor convertido e a taxa usada ficam gravados.

## 5. Recorrências

- Frequências: única, semanal, quinzenal, mensal, trimestral, semestral, anual e personalizada (a cada N dias/semanas/meses).
- Passos mensais são calculados a partir da data original (31/jan → 28/fev → 31/mar), sem "escorregar".
- Equivalente mensal: semanal × 52/12, quinzenal × 26/12, semestral ÷ 6, anual ÷ 12.

## 6. Bills & Payments

- Cada conta recorrente gera vencimentos ("ocorrências") até 62 dias à frente; cada ocorrência tem status próprio.
- Status: **paga** (pagamentos ≥ valor), **parcial**, **pendente**, **atrasada** (vencida sem quitação), **dispensada**.
- Pagamento parcial só é aceito se a conta permitir; nunca acima do restante.
- Custo estimado do atraso = multa fixa + valor × juros anuais × dias/365.

### Smart Payment Planner

Ordem: (1) prioridade essencial → importante → opcional; (2) atrasadas primeiro;
(3) vencimento mais próximo; (4) maior custo de atraso; (5) menor valor.
Alocação: primeiro os mínimos (ou o valor integral quando parcial não é permitido),
depois os complementos. Contas essenciais podem usar a reserva mínima (com aviso);
importantes e opcionais não. Uma opcional **nunca** passa à frente de uma essencial.
Empates na mesma prioridade são explicados na tela. Nada é pago de verdade.

## 7. University Debt Manager

```
saldo = saldo inicial + acréscimos semestrais + juros (se houver) ± ajustes − pagamentos
```

- O acréscimo (padrão 5.500, configurável) é **um novo valor somado à dívida**, separado de juros.
- Acréscimos são lançados automaticamente nas datas: âncora + k × intervalo (meses), apenas depois da data inicial e até a data de término (se informada). Cada um aparece no histórico com data e valor; anular um lançamento automático não o recria.
- Juros (opcional): lançados no último dia de cada mês sobre o saldo daquele dia (primeiro mês proporcional aos dias).
- **Simulador**: mês a mês, respeitando a data real de cada acréscimo e de cada pagamento (dia configurado, a partir da próxima data após hoje). Nunca usa "saldo ÷ pagamento".
- **Quitação** só é declarada quando o saldo chega a zero **e** não há acréscimos futuros.
- **Mínimo para não crescer** = acréscimo ÷ meses do intervalo + 1 mês de juros sobre o saldo atual. O app alerta quando o pagamento planejado é menor.
- **Estratégias**: Conservative / Balanced / Aggressive = 25% / 50% / 80% da sobra mensal estimada (arredondado para baixo a 10). Recomendação: reserva < 1 mês de despesas essenciais → Conservative; 1–3 meses → Balanced; ≥ 3 → Aggressive; se a recomendada não cobrir os acréscimos, sobe para a primeira que cobre.

## 8. Sobra mensal (capacidade)

- Renda mensal = equivalente mensal das receitas recorrentes ativas.
- Obrigações recorrentes = contas recorrentes + assinaturas + despesas recorrentes (equivalente mensal).
- Gastos variáveis = média dos últimos 3 meses completos (exclui contas, assinaturas e recorrentes); sem histórico, usa o total do orçamento, e o app avisa.
- Sobra = renda − obrigações − variáveis. Sempre exibida com premissas e dados faltando.

## 9. Quanto posso gastar

- **No mês**: saldo disponível − obrigações até o fim do mês (contas, pendentes, recorrentes, assinaturas, pagamento planejado da dívida, reservas planejadas para metas) − reserva mínima. Receitas futuras não entram.
- **Até o próximo recebimento**: mesma conta, até a véspera da próxima receita prevista.
- **Folga com receitas previstas**: menor saldo projetado nos próximos dias − reserva mínima.

## 10. Orçamento

- Gasto da categoria = despesas pagas + pendentes − reembolsos no mês.
- Estado: < 80% dentro; 80–100% próximo do limite; > 100% ultrapassado.
- Projeção do mês = gasto até agora + ritmo diário dos gastos **variáveis** × dias restantes.

## 11. Metas

- Acumulado = soma das contribuições (retiradas são negativas).
- Estimativa = meses necessários na contribuição planejada; necessário por mês = falta ÷ meses até a data limite.
- Recomendação de quanto guardar = sobra mensal − pagamento planejado da dívida, dividida por prioridade (3:2:1) respeitando o que cada meta precisa.

## 12. Assinaturas

- Valor mensal/anual estimado por ciclo; alerta de cobrança próxima conforme preferência.
- "Pouco uso" só aparece quando há **data de último uso** informada (> 30 dias). Sem dados, mostra "sem dados de uso".
