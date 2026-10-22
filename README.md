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
- “Switch sides” (botão com texto e setas horizontais) troca os times de lado na tela, acompanhando a posição dos jogadores na quadra. Cores, pontos e estatísticas permanecem vinculados ao mesmo time. A posição é salva e mantida ao reiniciar a partida; a troca não entra no histórico de pontos nem interfere no desfazer.
- Fechamento manual de sets, com confirmação; os totais individuais da partida são mantidos.
- Desfazer pontos e o fechamento do último set, em ordem inversa.
- Edição dos nomes com salvar/cancelar, sem perder os pontos. Campos em branco mantêm o nome anterior.
- Estatísticas, destaque individual (incluindo empates) e histórico de sets.
- Reiniciar a partida com confirmação, preservando os nomes.
- Interface em inglês, com layout compacto para celular, desktop e orientação horizontal. O título foi removido da tela de jogo, e os botões dos jogadores mantêm pelo menos 48 px de altura.
- Histórico de pontos recolhido por padrão; toque em “Recent points” para expandir. O histórico não aumenta a altura da tela enquanto está recolhido.
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

### Ícone e splash screen

O ícone usa uma bola de vôlei branca com painéis azuis e vermelhos sobre fundo azul-escuro (`#0E1220`). O favicon segue a mesma identidade.

- `assets/branding/icon.svg` e `assets/branding/splash.svg`: referências visuais editáveis; a prévia de splash ilustra o símbolo centralizado, não uma captura de dispositivo.
- `android/app/src/main/res/drawable/volleyball_mark.xml`: primeiro plano do ícone adaptativo, com margem para recortes do launcher.
- `volleyball_monochrome.xml`: versão para ícones temáticos no Android 13 ou superior.
- `volleyball_launcher.xml`: versão para launchers anteriores ao Android 8.
- `volleyball_splash_icon.xml` e `splash.xml`: símbolo de abertura e fundo para versões anteriores ao Android 12.
- `android/app/src/main/res/values/styles.xml`: configura o splash do sistema no Android 12 ou superior e a transição para o fundo escuro do aplicativo.

Os recursos Android são vetoriais e não exigem gerar imagens por densidade. A geometria da bola segue o ícone Material Design `SportsVolleyball`, disponível no pacote `@mui/icons-material` já usado no projeto. No Android 12 ou superior, a abertura usa o símbolo centralizado sobre uma cor sólida, conforme o formato nativo do sistema.

## iOS no próprio iPhone (conta gratuita)

O projeto inclui a plataforma iOS do Capacitor 8, com dependências nativas via Swift Package Manager. Requer um Mac com Xcode 26 ou superior e iPhone com iOS 15 ou superior. O app inclui os arquivos web e as fontes para funcionar offline.

```sh
npm ci
npm run ios:sync
npm run ios:open
```

### Primeira instalação

Se o Xcode informar que não há destinos disponíveis ou que “iOS 26.5 is not installed”, abra **Xcode > Settings > Components** e instale o componente iOS solicitado antes de compilar. O SDK pode aparecer em `xcodebuild -showsdks` mesmo com componentes de suporte ainda pendentes.

1. Conecte o iPhone ao Mac por cabo, desbloqueie e aceite “Confiar neste computador” se solicitado.
2. No Xcode, abra **Settings > Accounts** (ou **Apple Accounts**) e adicione sua conta Apple.
3. Na barra lateral, selecione o projeto **App** e depois o target **App**. Em **Signing & Capabilities**, mantenha **Automatically manage signing** ativado e selecione sua **Personal Team**.
4. Mantenha o identificador `com.diogobastos.volleyballscoreboard`. Se o Xcode indicar que ele está indisponível, escolha um identificador exclusivo e atualize também `appId` em `capacitor.config.json`.
5. Selecione o iPhone como destino na barra superior e clique em **Run** (⌘R). O Xcode baixa as dependências Swift na primeira compilação.
6. Se solicitado, ative **Ajustes > Privacidade e Segurança > Modo de Desenvolvedor** no iPhone e siga as instruções para reiniciar e confirmar.
7. Se o iPhone bloquear a abertura por desenvolvedor não confiável, vá a **Ajustes > Geral > VPN e Gerenciamento de Dispositivo**, selecione sua conta em App de Desenvolvedor e autorize.

A conta gratuita não permite usar TestFlight. O provisionamento para testes pessoais expira após sete dias; conecte o iPhone e execute novamente pelo Xcode para renovar. Para preservar a partida, atualize o app mantendo o identificador em vez de desinstalá-lo. Os dados do Safari e do app Android não são transferidos automaticamente.

Após alterações na interface, execute `npm run ios:sync` antes de usar **Run** no Xcode. Mantenha `ios/` no Git; arquivos web copiados, builds e configurações pessoais do Xcode ficam ignorados. A equipe de assinatura deve ser selecionada localmente no Xcode.

### Ícone e tela de abertura iOS

O catálogo `ios/App/App/Assets.xcassets` contém o ícone de vôlei de 1024 × 1024 px, opaco e sem cantos arredondados, e a bola em três escalas para a abertura. `LaunchScreen.storyboard` centraliza a bola em 192 pt sobre o fundo `#0E1220`, em retrato e paisagem.

Para regenerar os PNGs no Mac a partir dos caminhos vetoriais de `assets/branding/icon.svg`, execute `python3 scripts/generate-ios-branding.py`. O script usa Python padrão e Core Graphics via Swift, sem dependências extras. Depois compile novamente pelo Xcode. A abertura nativa aparece enquanto o app inicia e pode ser breve; voltar a um app já aberto não repete essa tela.

Referências: [Capacitor iOS](https://capacitorjs.com/docs/ios), [conta gratuita Apple](https://developer.apple.com/help/account/basics/about-your-developer-account) e [Modo de Desenvolvedor](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).

## Próximas etapas

- Testar o APK em um celular Android físico.
- Definir identificador definitivo e assinatura de release para distribuição.
- Instalar e testar no iPhone físico pelo Xcode.

Referências: [Material UI](https://mui.com/material-ui/getting-started/installation/), [Vite](https://vite.dev/guide/) e [Capacitor Android](https://capacitorjs.com/docs/android).
