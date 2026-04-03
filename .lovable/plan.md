## Diferenças identificadas entre nosso app e o site referência

### 1. Modal de Login
- **Referência**: Título "Bem-vindo de Volta" com avatar verde "A", subtítulo "Entre na sua conta", link "Não tem uma conta? Cadastre-se"
- **Nosso**: Título "ALPHA BOT", subtítulo "Entre na sua conta", sem link de cadastro

### 2. Header (logado)
- **Referência**: Mostra "clodoaldo123 ≡" (nome + ícone hamburger menu)
- **Nosso**: Mostra nome + ícone de logout separado

### 3. Sidebar (logado)
- **Referência**: Mostra iniciais do usuário "CL" no bottom + ícone de sair
- **Nosso**: Não mostra iniciais

### 4. Área do gráfico
- **Referência**: Não exibe candlestick chart visível, apenas preço grande e stats
- **Nosso**: Exibe candlestick chart completo (podemos manter, é uma melhoria)

### 5. Config Panel (logado)
- **Referência**: Valor de entrada auto-calculado (5% do saldo = R$ 766), Stop Win e Stop Loss auto-calculados (10x e 5x o entry), botão "Start"
- **Nosso**: Valores fixos (R$ 10, Stop Win 500, Stop Loss 100), botão "Login Necessário"/"Iniciar Bot"

### 6. Stats bar
- **Referência**: Labels sem valores quando não carregados
- **Nosso**: Mostra $0.00

### Plano de implementação:
1. Atualizar LoginModal com novo design (avatar, título, link cadastro)
2. Atualizar Header com menu hamburger quando logado
3. Atualizar SidebarNav com iniciais do usuário
4. Atualizar ConfigPanel para auto-calcular valores baseado no saldo
5. Pequenos ajustes de estilo nos stats e layout
