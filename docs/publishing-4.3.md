# Publicação — iOS 1.2.0 (5) e Android 1.2.0 (6)

O código consolidado fica em `master`. A publicação web principal continua sendo o projeto Direct Upload da Cloudflare Pages descrito abaixo; a branch de produção `public` é uma configuração desse projeto, não uma branch de desenvolvimento Git.

## Página pública

**Endereço principal na Cloudflare:**

https://volleyball-scoreboard-results.pages.dev/

Publicado em Cloudflare Pages por Direct Upload na conta Cloudflare existente, projeto `volleyball-scoreboard-results`, branch de produção `public`. O build contém apenas arquivos estáticos; banco, autenticação e permissões continuam no Supabase. Foram conferidos HTTPS, cabeçalhos, grupos, oito partidas, detalhes e recarga de links no site publicado, sem gravações remotas.

Para atualizar após revisar alterações:

```sh
pnpm test
pnpm run verify:remote
pnpm run build:public
pnpm run site:pages:check
pnpm run site:pages:deploy
```

Caso a sessão expire, execute `pnpm --package=cf@1.0.0-beta.28 dlx cf auth login` e autorize no navegador. O upload usa a API oficial do Pages, com a sessão OAuth da CLI cf apenas em memória. No Mac, o script lê o perfil padrão local do cf; em outro ambiente use `CF_AUTH_CONFIG` com o caminho do perfil, ou `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` definidos localmente. Nenhuma credencial é gravada no projeto. O comando de check apenas lista o total de arquivos, sem requisições remotas. O comando de deploy usa o build já preparado em `dist-public`, sem recompilá-lo. Não há integração Git automática neste projeto Direct Upload. Não foi configurado domínio próprio. O endereço anterior em Workers continua disponível: https://volleyball-scoreboard-results.diogovvb.workers.dev/ Os comandos `site:prepare`, `site:check` e `site:deploy` continuam específicos dessa publicação antiga. O site GitHub Pages abaixo também continua disponível como alternativa.

### Publicação alternativa no GitHub Pages

Publicação inicial: **GitHub Pages**, usando o repositório público já existente e a branch exclusiva `gh-pages`. É suficiente para este frontend estático; o banco e as permissões continuam no Supabase. Não requer outra conta nem servidor próprio. Endereço:

https://diogobas.github.io/volleyball_scoreboard/

A raiz orienta o visitante a abrir um link de comunidade ou grupo, sem listar todas as comunidades; links por hash permitem atualizar páginas sem erro 404. O build do aplicativo continua abrindo o placar. A interface de administração exige conta autorizada e internet. O site não contém senha administrativa nem chave service_role.

Para atualizar, na branch revisada, configure `.env.local` com a URL e chave **publishable** do Supabase conforme `docs/testing-supabase-admin-3.1.md`, autentique `gh auth login` e execute:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run verify:remote
pnpm run site:publish:github
```

O script compila `dist-public`, publica apenas os arquivos estáticos e `.nojekyll`, preserva o histórico da branch de publicação e habilita Pages quando ainda não configurado. Acompanhe o workflow de Pages em Actions; atualização não é instantânea. Não edite `gh-pages` manualmente nem faça merge dela na master. GitHub Pages não interpreta `public/_headers`; esse arquivo é interpretado na publicação Cloudflare Pages.

Para domínio próprio, configure Settings → Pages → Custom domain e o DNS conforme GitHub; o script preserva o domínio configurado por meio do arquivo CNAME. Nenhum domínio próprio foi configurado nesta entrega.

A publicação Cloudflare descrita acima já está ativa. O ZIP em `artifacts/web/volleyball-public-1.1.0.zip` também contém o build com index.html na raiz.

Se usar confirmação de e-mail/recuperação na conta, configure em Supabase → Authentication → URL Configuration os endereços de retorno usados no site. Não troque o endpoint do banco para o endereço do site. Consultas públicas não precisam de login.

Referências: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## iOS / TestFlight

Identificador: `ca.itelligent.volleyballscoreboard`. Versão **1.2.0**, build **5**. Archive, exportação e upload ao App Store Connect concluídos. O log `artifacts/ios/upload-1.2.0-5.log` confirma “Upload succeeded” e o início do processamento. A disponibilidade para testadores depende da conclusão desse processamento pela Apple e da seleção do build no grupo.

1. Abra [App Store Connect](https://appstoreconnect.apple.com/) → Volleyball Scoreboard → TestFlight.
2. Aguarde **1.2.0 (5)** terminar o processamento. Confira eventuais pendências de conformidade exibidas pela Apple.
3. Em **Internal Testing**, selecione/crie um grupo e adicione o build 5. Adicione seu usuário da equipe como testador.
4. No iPhone, abra o TestFlight com a conta convidada e instale/atualize o aplicativo. Execute o roteiro 4.3 antes de ampliar o grupo.
5. Para pessoas que não pertencem à equipe App Store Connect, use **External Testing**; o primeiro build externo depende da Beta App Review. Preencha as informações de teste solicitadas pela Apple e selecione os testadores.

Para novos builds, aumente CURRENT_PROJECT_VERSION nas duas configurações do Xcode, execute `pnpm run ios:sync`, gere Archive e envie pelo Organizer. Há opções de exportação em `release/ios/`. Não reenvie o mesmo número de build. O IPA desta entrega está em `artifacts/ios/TestFlight-1.2.0-5/App.ipa`.

Referência: [testadores internos](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers), [TestFlight externo](https://developer.apple.com/testflight/).

## Android / teste interno Google Play

Roteiro para amanhã, **9 de novembro de 2026**: [passo a passo do teste interno](google-play-teste-interno-2026-11-09.md). O AAB foi gerado com a chave existente, verificado com jarsigner e comparado ao certificado do pacote anterior.

Identificador: `com.diogobastos.volleyballscoreboard`. Versão **1.2.0**, versionCode **6**, mínimo Android 7/API24, destino API36. O pacote assinado está pronto, mas **não foi enviado ao Play Console**:

`artifacts/android/VolleyballScoreboard-1.2.0-6.aab`

1. Abra [Play Console](https://play.google.com/console) e escolha **Criar app**. Nome sugerido: Volleyball Scoreboard; idioma inglês; tipo App; gratuito. Preencha as declarações da sua conta.
2. Abra **Testar e lançar → Teste → Teste interno** e crie uma versão.
3. Configure **Play App Signing**, permitindo que o Google gere a chave de assinatura do app. O arquivo fornecido usa sua chave de **upload**, que tem função distinta.
4. Envie o AAB acima. Confira pacote, versão 1.2.0 e código 6. Use as notas em `release/GooglePlayReleaseNotes-1.2.0-6.txt` como base.
5. Salve, revise e resolva as pendências indicadas pelo Console; inicie o lançamento para teste interno.
6. Em **Testadores**, crie/selecione a lista com as Contas Google dos participantes, salve e copie o link de participação.
7. Abra o link com uma conta dessa lista, aceite o teste e instale pela Play Store. O teste interno comporta até 100 testadores; o aplicativo não precisa aparecer na busca pública.

**Backup obrigatório para continuidade das atualizações:** guarde em local privado `artifacts/android/signing/volleyball-upload.jks` **e** `android/keystore.properties` (contém as senhas). Ambos estão ignorados pelo Git. Não os envie para o repositório nem para testadores. `scripts/create-android-upload-key.py` cria a configuração local inicial; não substitua a chave existente ao atualizar este app.

Para novos bundles: aumente versionCode, mantenha a chave existente, execute `pnpm run android:bundle`. O resultado fica em `android/app/build/outputs/bundle/release/app-release.aab`. O build release falha com instrução explícita quando a assinatura local não está configurada.

Uma instalação antiga feita pelo APK debug pode ter assinatura diferente da Play Store. Antes de qualquer desinstalação exigida para trocar de assinatura, envie todas as partidas pendentes e confira os resultados no site; desinstalar apaga dados locais. Para a publicação no Google Play, use o AAB assinado indicado acima.

Referência: [teste interno Google Play](https://support.google.com/googleplay/android-developer/answer/9845334).

## Armazenamento e atualização

Dados locais pertencem ao aplicativo/aparelho ou à origem do navegador (protocolo, domínio e porta). Trocar de hospedagem não transfere a partida atual nem pendências. Desinstalação, limpeza de dados e eventual remoção de armazenamento pelo navegador podem apagar conteúdo que ainda não foi confirmado pelo servidor. Atualize mantendo identificador e assinatura; envie pendências antes de migrar instalações. As partidas confirmadas e seus resultados permanecem no Supabase.


## Atualização web — 08/11/2026

Esta atualização reúne a navegação por seções no grupo, administração de jogadores/dias/partidas, registro histórico por placares e pontos opcionais, seleção de jogadores cadastrados com cadastro no próprio dropdown, sincronização direta de partidas finalizadas e descarte de partidas locais pendentes. As estatísticas mostram aproveitamento de vitórias e presença por data da temporada, preservando o resultado competitivo antes dos sets de treino.

O banco requer as migrações até `20261108001200_player_attendance_statistics.sql`. O verificador remoto é somente leitura e confere consulta pública/detalhes e restrição da edição anônima antes do upload. Builds web usam o endpoint público existente do Supabase, sem credenciais administrativas. Esta publicação web não é um novo envio de binários à Apple ou ao Google Play.

As branches de desenvolvimento já contidas no histórico consolidado podem ser removidas após a integração. Preserve `gh-pages`, que contém o histórico da hospedagem alternativa; ela não deve ser incorporada a `master`. A limpeza não deve excluir branches com commits exclusivos.


## Política de privacidade e Android build 6

URL para o Play Console: https://volleyball-scoreboard-results.pages.dev/privacy.html

A página estática identifica o app e o desenvolvedor, descreve dados locais, sincronização e resultados públicos, provedores, retenção/auditoria e pedidos de correção/exclusão pelo contato autorizado `diogovvb@gmail.com`. O texto foi elaborado a partir do comportamento atual do código; não afirma que todas as exigências legais ou todos os formulários do Google estejam concluídos.

O build Android **1.2.0 (6)** acrescenta **Privacy policy** ao final da tela, com uma cópia HTML incluída no próprio pacote, acessível offline. A mesma página é vinculada nos resultados públicos e na administração web. O build 5 já distribuído não recebe esse link automaticamente; envie o novo AAB para a faixa Internal testing para atualizar o app. O TestFlight permanece no build 5 nesta entrega.

O pacote é `artifacts/android/VolleyballScoreboard-1.2.0-6.aab`, assinado com a chave existente. A política também está em `base/assets/public/privacy.html` dentro do AAB. Os testes de navegador cobrem os links e o conteúdo público, sem exigir conta, inclusive o acesso pelo app.


## Publicação web — 09/11/2026

Esta versão reúne as temporadas por período/ano, proteção contra exclusão de resultados finalizados, criação de grupos por diálogo, comunidades com permissões herdadas, reaproveitamento de jogadores entre grupos, perfis com sexo/posições e estatísticas, edição pela página do jogador e encerramento explícito de partidas históricas como empate.

A comunidade inicial é Montreal Volleyball Community (`C-1`), administrada pela conta confirmada `diogovvb@gmail.com`. A página compartilhável é `https://volleyball-scoreboard-results.pages.dev/#/communities/C-1`. O diretório geral não é público; a API bloqueia consultas anônimas às tabelas gerais. As estatísticas e permissões de jogadores permanecem por grupo.

O banco publicado já foi verificado com as funcionalidades das migrações `20261109000100` a `20261109000400`: comunidade, perfis de jogadores e metadados de empate estão disponíveis. O verificador remoto passou em modo somente leitura, incluindo a restrição das tabelas gerais. Nenhuma migração foi reaplicada durante esta publicação, e os resultados existentes foram preservados.

Validação da versão: 242 testes, builds do app/site e cenários de navegador de administração, páginas públicas, comunidades e placar. O código segue o fluxo branch → pull request → CI → master. O deploy usa o projeto Direct Upload já existente, sem criar outro site ou alterar seu endereço. Esta publicação web não envia novos binários para Apple ou Google Play.
