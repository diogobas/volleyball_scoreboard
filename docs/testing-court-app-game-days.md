# App de quadra e administração por dia de jogo

Branch: `feat/court-app-game-days`, baseada em `feat/public-stats-admin`. Versão preparada: **1.2.0 (4)**.

O app volta à edição livre de nomes. Conta, cadastro, conciliação e publicação ficam no site. O código autoriza apenas baixar a escalação e enviar resultados do dia; não é uma conta administrativa.

## Preparação e publicação

1. Faça backup do banco Supabase e mantenha a versão atual do site disponível para reversão do frontend. Não limpe o armazenamento dos celulares.
2. Aplique, depois das cinco migrações existentes, `supabase/migrations/20261107000100_game_days_and_private_review.sql` pelo fluxo SQL já utilizado no projeto. A migração inteira roda em uma transação. Ela conserva os resultados públicos existentes e cria cópias privadas para revisão futura.
3. Execute `npm test`, `npm run build` e `npm run build:public`. As variáveis Supabase continuam sendo as mesmas de `.env.example`; nenhuma chave privilegiada entra no frontend.
4. Publique `dist-public` no projeto Pages existente usando `npm run site:pages:check` e `npm run site:pages:deploy`. O painel fica em `https://volleyball-scoreboard-results.pages.dev/#/admin`. O script tenta renovar sessões expiradas do perfil padrão usando `cf auth whoami`; se a renovação falhar, execute `npm exec --yes --package=cf@1.0.0-beta.28 -- cf auth login` e tente publicar novamente. Perfis personalizados via `CF_AUTH_CONFIG` devem ser renovados explicitamente na CLI.
5. Gere e instale os apps com `npm run android:sync` / `npm run ios:sync` e o procedimento nativo habitual. No Android, `cd android` e `./gradlew assembleDebug` gera `android/app/build/outputs/apk/debug/app-debug.apk`.
6. Aplique primeiro o banco, depois o site e os apps. Clientes antigos passam a receber confirmação de **recebimento privado**, mesmo que sua mensagem antiga ainda diga que o resultado está público. A confirmação já permite limpar o celular porque a submissão original está preservada no servidor.

A implementação não aplica a migração, publica o site nem envia builds às lojas automaticamente. A reversão apenas do frontend não restaura publicação direta: o banco continuará exigindo revisão no site. Mantenha acesso à nova área administrativa.

## Etapa 1 — App simplificado e armazenamento local

1. Abra o app atualizado com uma partida existente. Confira nomes, pontos, sets, lados e Undo. Os menus Account & Groups, Players & sync e Public results não devem aparecer.
2. Abra **Edit names**, altere nomes dos dois times e de jogadores, salve e reinicie o app. Os campos são livres, sem conta, grupo ou cadastro obrigatório. Campos em branco conservam o nome anterior.
3. Marque pontos, altere o nome de uma posição e marque mais pontos. As marcações anteriores mantêm seu nome original no registro. A revisão da identidade será feita no site.
4. Tente salvar com pontos em um set aberto: **Save match** permanece desabilitado. Encerre o set; a opção fica disponível. Cancele o resumo e confira que nada foi encerrado.
5. Ative o modo avião. Salve por **Save locally**. Uma nova partida começa com os mesmos nomes e lados. Não há tentativa automática de envio.
6. Reinicie ainda offline. Abra **Saved matches (1)** e confira o resumo. Faça outra partida e repita: ambas devem continuar disponíveis.
7. Reconecte sem apertar Sync. As partidas continuam locais. Falha de rede ou código inválido ao sincronizar mantém a partida e mostra o erro.

Esperado: preservação dos dados existentes, edição simples e nenhuma dependência de internet para jogar ou salvar. Undo desfaz pontos/sets; a edição de nomes permanece, como na versão anterior.

## Etapa 2 — Dia de jogo, código e recebimento privado

1. Entre no site em **Administration** com uma conta administrativa existente. Abra **Manage group**. Cadastro de jogadores e permissões ficam nessa página.
2. Se necessário, abra **Registered players** e cadastre os participantes. Nomes semelhantes não são unidos automaticamente; use um nome completo distinto para outra pessoa.
3. Crie um dia com data no fuso do grupo, nomes dos dois times e seis jogadores diferentes em cada lado. **Create day & code** mostra um código copiável. Copie antes de sair: o servidor guarda apenas o hash.
4. No app, sem pontos registrados, toque em **Use game-day code** na tela principal, informe o código, confira grupo/data/times e confirme em **Load lineup**. A escalação é aplicada e salva diretamente, sem uma segunda confirmação em Edit names. Coloque em modo avião e reinicie: escalação e vínculo permanecem.
5. Comece a pontuar e abra Edit names. A edição livre continua disponível; **Load lineup** fica bloqueado para evitar sobrescrever o jogo em andamento.
6. Encerre um set e, online, escolha **Save & sync**. Sem vínculo prévio, essa ação pede um código para associar somente a partida salva; não altera seus nomes. Com vínculo, envia diretamente.
7. Confira o recebimento em **Administration → Manage group → Open day → Private inbox**. A partida deixa o celular após confirmação, mas ainda não aparece na consulta pública.
8. Jogue outra partida sem baixar escalação, salve offline e depois abra **Saved matches → Link game day**. O código associa o dia sem substituir os dados. Aperte **Sync**.
9. No site, informe um motivo e use **Generate new code** ou **Revoke code**. O código anterior para de funcionar. O celular continua jogando/salvando offline; para enviar pendências, use **Update code** com um novo código do mesmo dia.
10. Atualize a escalação no site enquanto o dia estiver aberto, informando um motivo e usando **Save lineup version**. O app só recebe a nova versão se o operador carregar explicitamente a escalação antes de pontuar.

Esperado: operador sem login; código limitado ao dia; recebimentos privados e duráveis; nenhuma união de pessoas por nome. Um código já associado pode ser atualizado, mas a partida não pode ser transferida para outro dia pelo operador.

## Etapa 3 — Conciliação, fechamento e republicação

1. Abra um recebimento. Para cada nome desconhecido, selecione explicitamente o jogador cadastrado. Identidades provenientes da escalação baixada podem vir preenchidas; confira-as.
2. Se houve substituição ou correção de grafia, associe cada variante. Uma correção pode apontar para a mesma pessoa; uma substituição pode apontar para outra. **Build draft from associations** aplica o mapeamento e substitui edições anteriores do rascunho.
3. Confira todos os participantes e pontos. O editor permite corrigir autoria, adicionar/remover pontos e ajustar limites dos sets. Substitutos podem aparecer como participantes adicionais do set; o mesmo jogador pode ter atuado pelos dois lados em trechos diferentes.
4. Informe um motivo, use **Review approval** e **Confirm private approval**. O resultado continua privado. Para envios duplicados/indevidos, informe um motivo e use **Disregard match**; a submissão original e o histórico continuam guardados.
5. Tente fechar com um recebimento pendente. O fechamento fica bloqueado. Após revisar todos, informe o motivo do dia e use **Close day & publish**.
6. Abra a consulta pública em outra sessão, sem login. Confira sets, pontos, participantes sem pontos, frequência e vitórias. Quem atuou pelos dois times não recebe vitória individual. Todos os resultados incluídos entram juntos.
7. Envie uma partida que ficou offline depois de o dia ser fechado. Ela aparece como pendência privada. Informe um motivo e use **Reopen day**, revise-a e feche novamente. Os resultados públicos anteriores permanecem visíveis até a republicação.
8. Reabra para corrigir um resultado publicado. Salve a revisão privada e confira, em outra sessão, que o público ainda vê a versão anterior. Feche novamente para publicar a correção.
9. Desconsidere uma partida já publicada e feche novamente: ela e suas estatísticas somem da consulta pública; o recebimento e a trilha de revisão continuam privados.
10. Abra o mesmo dia em duas sessões administrativas. Depois de uma salvar, a outra deve receber conflito de versão ao tentar gravar dados desatualizados. Use Refresh e revise novamente.
11. Consulte **Original & private review history** e **Private day history & lineup versions**. Confira autor, data, motivo e valores anteriores/posteriores.
12. Tente acessar como visitante e como conta de outro grupo. Nenhuma das sessões deve consultar recebimentos, revisar ou fechar o dia. O código não concede esses poderes.

## Verificações automatizadas e limites

- `npm test` cobre as regras existentes e os novos fluxos com IndexedDB simulado e PostgreSQL via PGlite. Os testes de migração carregam os cinco scripts anteriores, criam resultados legados e só então aplicam o novo script.
- Arquivos locais antigos com jogadores registrados preservam o contrato original de envio: uma confirmação perdida antes da atualização pode ser recuperada usando o código, sem gerar outra partida. Cadastros provisórios antigos também são recebidos para revisão, sem criar jogadores automaticamente.

- Os testes incluem confirmação divergente, resposta perdida, reenvio, concorrência no celular, atualização do código, participantes por trecho, mudanças de nomes com Undo, isolamento de grupos e publicação/republicação.
- Os builds web, Android e iOS são verificações distintas do uso em aparelho físico. Repita as etapas 1 e 2 em Android e iPhone antes de distribuir.
- `navigator.onLine` indica conectividade aparente. Uma rede Wi-Fi sem acesso ao Supabase ainda pode falhar; a partida fica no aparelho.
- Partidas legadas não continham todas as trocas de nomes de participantes sem pontos. A revisão utiliza os dados efetivamente preservados; não inventa identidades históricas ausentes.
- Limpar os dados do app ou desinstalá-lo pode apagar partidas não sincronizadas. O sistema preserva os dados durante atualizações normais e só limpa partidas após recibo remoto correspondente.

## Teste automatizado de interface

O script `scripts/check-court-flow.mjs` verifica a interface mobile com Chrome e respostas Supabase simuladas. Todas as requisições externas são interceptadas: ele não grava no projeto remoto. O PostgreSQL real é validado separadamente por `npm test`.

Com `playwright-core` disponível, inicie o Vite local e execute `BASE_URL=http://127.0.0.1:5173 npm run test:court:browser`. Se a biblioteca estiver instalada em outro diretório, informe `PLAYWRIGHT_MODULE` com o caminho absoluto de seu `index.mjs`. O teste usa a instalação local do Google Chrome e salva capturas em `artifacts/court-browser/`.

Para isolar também a configuração, inicie o Vite com `VITE_SUPABASE_URL=https://volleyball-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test npm run dev -- --host 127.0.0.1`. O teste emula o sinal offline mantendo os arquivos locais acessíveis, como ocorre no app nativo; isso não substitui o teste em modo avião no aparelho.

## Resultado desta implementação — 7 de novembro de 2026

- `npm test`: **156 testes aprovados**, nenhum erro ou teste ignorado.
- Builds do placar e do site público aprovados; `cap sync` concluído para Android e iOS.
- Chrome, viewport 390 × 844, serviços externos simulados: edição livre, carregamento por código, salvamento com sinal offline, reinício, envio manual, conciliação de substituição e fechamento do dia aprovados; nenhuma exceção JavaScript ou rolagem horizontal na administração.
- Android: `assembleDebug --offline` aprovado. APK de teste: `artifacts/android/VolleyballScoreboard-1.2.0-4-debug.apk`.
- iOS: build Debug para simulador aprovado, sem assinatura. Produto: `artifacts/ios/court-simulator-build/Build/Products/Debug-iphonesimulator/App.app`.
- Logs em `artifacts/court-validation/`; capturas em `artifacts/court-browser/` (artefatos locais ignorados pelo Git).
- Não havia aparelho Android conectado ou simulador iniciado. O teste em modo avião no aparelho físico permanece como validação manual do roteiro.
- Nenhuma migração remota, publicação no Pages, instalação em celular ou submissão às lojas foi feita nesta implementação.

## Publicação após aplicação da migração

Em 7 de novembro de 2026, após a aplicação da migração pelo responsável, o site 1.2.0 foi publicado no Cloudflare Pages. Deployment: `790bb711-3127-4d23-9a86-4f8b08d331ae`. A sessão OAuth expirada foi renovada pela CLI oficial; o uploader agora tenta essa renovação automaticamente no perfil padrão antes de pedir novo login.

A verificação remota somente de leitura confirmou os oito resultados existentes, seus detalhes e o bloqueio de acesso administrativo anônimo. Administração: `https://volleyball-scoreboard-results.pages.dev/#/admin`. A publicação do site não envia o app ao TestFlight.

## Envio ao TestFlight — 7 de novembro de 2026

A versão **1.2.0 (4)** foi arquivada, assinada, exportada e enviada ao App Store Connect. O log `artifacts/ios/upload-1.2.0-4.log` confirmou `Upload succeeded` e `Uploaded package is processing`. Isso confirma o recebimento pela Apple, sem confirmar conclusão do processamento ou liberação ao grupo de testadores.

- Archive: `artifacts/ios/VolleyballScoreboard-1.2.0-4.xcarchive`.
- IPA de distribuição: `artifacts/ios/TestFlight-1.2.0-4/App.ipa`.
- Testes repetidos antes da geração: 156 aprovados; `npm run ios:sync` concluído.
- Após o processamento, conferir App Store Connect → Volleyball Scoreboard → TestFlight e adicionar o build ao grupo existente, se necessário. Atualizar pelo TestFlight preservando a instalação; validar o roteiro offline em aparelho físico.

## Ajuste de preparação da partida — 8 de novembro de 2026

Antes do primeiro ponto, a tela principal oferece **Use game-day code** e **Play independently**. O código baixa os times previamente definidos pelo administrador; a confirmação aplica a escalação e aguarda a gravação local antes de fechar o diálogo. Grupo e data aparecem na prévia do código. Ao confirmar a escalação, o aviso de preparação desaparece e o placar fica alinhado ao topo, ocupando a tela. O aviso também permanece oculto ao reabrir uma escalação já carregada, inclusive offline. O uso sem código continua disponível desde a abertura, sem exigir nenhuma seleção.

**Play independently** remove o vínculo do jogo atual com o dia/grupo, conservando os nomes editáveis e os lados. As partidas arquivadas não são alteradas. Após o primeiro ponto, as opções de preparação saem da tela para proteger a partida em andamento; a edição livre de nomes permanece disponível.

Validação: **157 testes aprovados**, build web aprovado e fluxo Chrome mobile aprovado para cancelamento do código, carregamento direto, escolha independente e retorno offline. A captura está em `artifacts/court-browser/pregame-mobile.png`. Este ajuste é posterior ao TestFlight 1.2.0 (4); nenhum novo build foi enviado nesta etapa.

## Navegação pública por grupo — 8 de novembro de 2026

A página pública do grupo foi dividida em **Overview**, **Players** e **Matches**, exibindo apenas a seção selecionada. Overview mostra os totais da temporada; Players contém a tabela individual; Matches contém a lista paginada e os links para detalhes. Temporada e página são preservadas na navegação, inclusive ao voltar dos detalhes, recarregar e usar Voltar no navegador. Trocar apenas a seção reutiliza os dados carregados.

Para conferir localmente, abra um grupo em `/#/groups`, navegue pelas três seções, troque a temporada, abra uma partida e use **Back to matches**. O teste automatizado fica em `npm run test:public:browser`, com as mesmas variáveis `BASE_URL` e `PLAYWRIGHT_MODULE` do teste mobile anterior. Foram aprovados os 157 testes, o build público e a navegação Chrome mobile com respostas simuladas. Esta alteração ainda não foi publicada no site.
