
# Backend Independente - Alpha Bot

## O que continua usando a Unic Broker (sua API)
- ✅ Dados de mercado (symbols, historical-data)
- ✅ Abertura de posições (open-position)
- ✅ Settlement e saldo
- ✅ Login na corretora (para obter token de trading)

## O que terá backend próprio (Lovable Cloud)
1. **Autenticação própria** — Cadastro/login de usuários com Supabase Auth (email/senha, Google, etc.)
2. **Banco de dados** — Tabelas para:
   - `profiles` — dados do usuário (nome, avatar, configurações)
   - `broker_credentials` — token da Unic Broker vinculado ao usuário (criptografado)
   - `trade_history` — histórico completo de operações persistido
   - `bot_configs` — configurações salvas do bot por usuário
3. **Edge Functions** — Para:
   - Proxy seguro para a API da Unic Broker (tokens ficam no servidor, não no frontend)
   - Lógica de análise de mercado server-side
4. **RLS Policies** — Cada usuário só acessa seus próprios dados

## Benefícios
- Usuários se cadastram direto no seu app
- Histórico de trades persiste entre sessões
- Credenciais da corretora ficam seguras no servidor
- App funciona 100% independente como produto
