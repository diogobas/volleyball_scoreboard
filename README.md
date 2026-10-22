# Placar de Vôlei

Migração do arquivo `Volleyball Scoreboard.html` para React, Material UI e Vite. O HTML original está preservado como referência e não faz parte do build.

## Executar localmente

Use Node.js 22.12 ou superior na versão 22, ou Node.js 24 ou superior.

```sh
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://localhost:5173`.

Para testar no celular conectado à mesma rede:

```sh
npm run dev -- --host 0.0.0.0
```

Acesse o IP do computador e a porta mostrada no terminal. Esse servidor é para desenvolvimento.

## Recursos

- Dois times com seis jogadores cada, mantendo os elencos originais.
- Um toque no jogador adiciona um ponto ao time e às estatísticas individuais.
- “Opponent error” adiciona um ponto ao time da coluna selecionada, sem entrar na disputa de destaque individual.
- Placar do set, sets vencidos e pontos acumulados por jogador.
- Fechamento manual de sets, com confirmação; os totais individuais da partida são mantidos.
- Desfazer pontos e o fechamento do último set, em ordem inversa.
- Edição dos nomes com salvar/cancelar, sem perder os pontos. Campos em branco mantêm o nome anterior.
- Estatísticas, destaque individual (incluindo empates) e histórico de sets.
- Reiniciar a partida com confirmação, preservando os nomes.
- Interface em inglês, com layout para celular, desktop e orientação horizontal.
- Salvamento automático no `localStorage`, incluindo o histórico necessário para desfazer após recarregar.
- Fontes distribuídas no próprio build, sem dependência do Google Fonts em tempo de execução.

O encerramento continua manual, como no HTML original: não há limite automático de 25/15 pontos, diferença mínima de dois pontos ou fim da partida por melhor de três/cinco. Um set empatado pode ser fechado e não acrescenta vitória a nenhum time.

Os dados ficam apenas no navegador/dispositivo e na origem usada para acessar o app. Limpar os dados do site apaga a partida; mudar de endereço, porta ou dispositivo não transfere os dados. Não há backend, conta de usuário ou sincronização nesta etapa.

## Verificar e gerar o build

```sh
npm test
npm run build
npm run preview
```

Os testes cobrem pontuação, erros adversários, desfazer entre sets, empate, edição, reset e recuperação de dados salvos. O build é gerado em `dist/`. O comando `preview` permite verificar esse build localmente.

## Organização

```text
src/
  components/       # Placar, jogadores, edição e estatísticas
  game/match.js     # Estado, regras da partida e recuperação local
  game/match.test.js
  App.jsx           # Fluxo da aplicação e persistência
  main.jsx          # Entrada React, tema e fontes
  styles.css        # Layout responsivo
  theme.js          # Tema Material UI
```

## Próximas etapas

1. Integrar uma camada Android, por exemplo Capacitor, e configurar identificação, ícones e build do APK.

Estas integrações ainda não foram realizadas. A base relativa do Vite permite servir o build em subpastas e facilita seu uso futuro em um contêiner Android.

Referências: [Material UI](https://mui.com/material-ui/getting-started/installation/) e [Vite](https://vite.dev/guide/).
