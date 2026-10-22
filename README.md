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

## Android e APK

O projeto usa Capacitor 8 para incluir a aplicação React em um app Android. A interface continua em inglês. Os arquivos e as fontes ficam dentro do APK, sem precisar do servidor Vite ou de internet para usar o placar.

- Nome: `Volleyball Scoreboard`
- Identificador: `com.diogobastos.volleyballscoreboard`
- Versão inicial: `1.0` (`versionCode` 1)
- Android mínimo: 7.0 (API 24), com Android System WebView atualizado.
- SDK de compilação e destino: API 36.

### Preparar o ambiente

Instale o Android Studio, o JDK 21 e o SDK Android 36. No SDK Manager, instale também Android SDK Build-Tools 36 e Platform-Tools. Configure o caminho do SDK pelo Android Studio ou crie `android/local.properties` com `sdk.dir=/caminho/do/seu/Android/sdk`. Esse arquivo é local e não deve ser enviado ao Git.

### Gerar um APK instalável de teste

```sh
npm ci
npm run android:apk
```

Esse comando gera o build web, sincroniza o Capacitor e executa `assembleDebug`. Na primeira execução, o Gradle precisa de internet para baixar as ferramentas e dependências.

O APK fica em:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

O APK de debug é assinado automaticamente para testes. Para instalar, envie o arquivo ao celular, abra-o e autorize a instalação por essa origem quando o Android solicitar. Para atualizar uma instalação existente, use um APK com o mesmo identificador e a mesma chave de assinatura. A assinatura de debug é local à máquina; não é a chave de publicação.

Com um dispositivo conectado por USB e depuração USB autorizada, também é possível instalar pelo terminal:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Os dados da versão web não são transferidos automaticamente para o app Android. Os dados do app são locais; desinstalá-lo ou limpar seus dados pode apagar a partida.

### Abrir no Android Studio

```sh
npm run android:sync
npm run android:open
```

Após qualquer alteração na interface, execute `npm run android:sync` antes de compilar pelo Android Studio. O comando `npm run android:apk` já faz isso automaticamente.

Mantenha `android/` no Git, incluindo o Gradle Wrapper e seus arquivos nativos. Builds, `local.properties`, arquivos web copiados e chaves de assinatura ficam ignorados.

## Próximas etapas

- Testar o APK em um celular Android físico.
- Definir ícone, identificador definitivo e assinatura de release para distribuição.
- Adicionar a plataforma iOS quando necessário.

Referências: [Material UI](https://mui.com/material-ui/getting-started/installation/), [Vite](https://vite.dev/guide/) e [Capacitor Android](https://capacitorjs.com/docs/android).
