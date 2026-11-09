# Aprovação da subfase 3.4 — fila manual e recuperação de falhas

Branch: `feat/supabase-sync`. **History → Sync pending matches** envia as partidas que estavam pendentes quando você apertou o botão. Cada partida é confirmada e removida separadamente. Um erro não impede o envio das demais.

## Preparação

1. Use o mesmo projeto Supabase das etapas anteriores, com as três migrações já aplicadas. Esta subfase **não exige SQL novo**. Se ainda não aplicou a migração da 3.3, siga [o roteiro do envio imediato](testing-match-upload-3.3.md).
2. Na branch indicada, execute `npm ci` e `npm run dev`. Abra o mesmo endereço/porta de antes, sem limpar dados ou desinstalar o aplicativo. O IndexedDB continua na versão 3; erros e tentativas usam `settings`, separados dos pontos e arquivos das partidas.
3. Entre como administrador do grupo em **Account & groups**. Em **Players & sync**, atualize o grupo e confira os jogadores. Partidas ainda sem associação precisam de **History → Associate players**; arquivos do Development group precisam da ligação explícita a um grupo online.

## Fila offline, reinício e envio pelo botão

1. Com o cadastro já baixado, desconecte a internet/modo avião. Jogue, encerre um set e feche a partida. Repita para criar pelo menos duas pendências. Resultado esperado: os arquivos aparecem em **History**, com placares e detalhes preservados.
2. Feche e reabra o aplicativo instalado. Na versão web, reconecte antes de recarregar caso os arquivos do site precisem da rede. Resultado esperado: partidas continuam locais. Reconectar, recarregar, abrir History ou atualizar jogadores **não envia a fila automaticamente**.
3. Ainda offline, aperte **Sync pending matches**, se desejar testar a falha imediata. Resultado esperado: todas permanecem salvas, cada uma com **Upload failed**, mensagem de falta de conexão e data da tentativa. Esses erros continuam visíveis após reiniciar.
4. Reconecte, confirme o login e abra **History**. Confira primeiro os detalhes. Aperte **Sync pending matches** uma vez. Resultado esperado: botão bloqueado durante o envio e indicação **Uploading match X of Y**. Cada arquivo em envio mostra **Uploading**. É possível voltar para Game e continuar jogando; ao retornar a History, o andamento é recuperado.
5. Ao concluir, confira o resumo de confirmadas/falhas e o histórico. Resultado esperado: arquivos confirmados saem da lista; erros ficam no aparelho com sua mensagem. `matches`, `match_sets`, `set_players` e `match_points` no Supabase contêm os dados completos, sem UUIDs duplicados.
6. Recarregue. Resultado esperado: confirmações não reaparecem como pendências. A partida atual e o cadastro permanecem, e erros de arquivos ainda não confirmados continuam disponíveis.

O botão considera todos os grupos com arquivos pendentes no aparelho. Uma conta sem acesso a determinado grupo recebe erro naquele arquivo; os grupos autorizados continuam sendo processados. Partidas fechadas durante a execução não entram no lote já iniciado: seguem sua tentativa automática online ou ficam para o próximo clique.

## Falha parcial e nova tentativa

1. Prepare duas partidas pendentes. No Chrome DevTools, use **Network → Request blocking** para bloquear `*rest/v1/rpc/submit_match*`.
2. Use **Sync pending matches**. Resultado esperado: arquivos com erro permanecem integralmente no aparelho. Desative o bloqueio e aperte o botão novamente; devem ser confirmados sem duplicação.
3. Para testar uma falha apenas em parte da fila, mantenha o painel Network aberto e remova o bloqueio quando a primeira partida mostrar erro, enquanto a próxima estiver sendo processada. Se a fila terminar rápido demais, use a alternativa com dois grupos abaixo. Resultado esperado: confirmadas são removidas, e apenas as falhas permanecem.
4. Alternativa determinística: prepare uma pendência em cada um de dois grupos administrados pela mesma conta. Usando outra conta administradora, revogue o acesso da primeira em somente um desses grupos, mantendo outro administrador no grupo. Envie pelo botão com a primeira conta. Resultado esperado: arquivo do grupo revogado permanece, enquanto o outro é confirmado e removido. Reautorize, atualize o acesso e tente novamente: somente o que permaneceu deve ser enviado.
5. Para uma sessão encerrada, saia da conta e tente enviar uma pendência. Resultado esperado: mensagem para entrar, sem perder pontos nem arquivo. Entre novamente e repita pelo botão.
6. Para um conflito de participante, crie a situação de nomes concorrentes descrita na [3.2](testing-player-sync-3.2.md). Resultado esperado: o arquivo afetado fica pendente com orientação para **Players & sync**; arquivos cujos participantes já estejam confirmados continuam. Resolva a identidade e repita o botão.

Se uma resposta se perder depois de o servidor salvar, a cópia local permanece e o reenvio confirma o mesmo UUID, sem inserir outra partida. A confirmação sempre compara o conteúdo original, mesmo que uma correção administrativa futura mude o resultado remoto.

## Envios simultâneos e interrupções

1. Com uma pendência e conexão lenta (por exemplo, Network → Slow 3G no DevTools), aperte o botão duas vezes rapidamente. Resultado esperado: uma execução, sem duplicar a partida.
2. Abra o mesmo aplicativo em outra aba, entre em History e use **Refresh saved matches** durante o envio. Resultado esperado: o arquivo mostra **Uploading** e o botão fica indisponível. Outra tentativa simultânea da mesma partida é recusada; a tentativa em andamento não perde seu estado.
3. Em um teste separado, feche/recarregue a aba durante o envio e volte a History. Resultado esperado: o arquivo não confirmado permanece. Se o envio já tinha sido confirmado e removido localmente, ele estará ausente. Um bloqueio deixado por uma interrupção expira em até cerca de 90 segundos desde sua última renovação; depois aparece **Upload interrupted**, permitindo nova tentativa. Use **Refresh saved matches** para conferir.
4. Uma tentativa sem resposta é encerrada depois de aproximadamente 60 segundos enquanto o app está ativo. Resultado esperado: erro visível e arquivo preservado. Uma resposta atrasada não remove o arquivo por conta própria depois desse encerramento. Conecte novamente e tente pelo botão; em falha repetida de sessão/rede, recarregue e entre novamente.

As proteções usam Web Locks quando disponíveis e bloqueio transacional no IndexedDB para conexões independentes. A confirmação e a remoção local verificam quem ainda controla a tentativa. Pausas do sistema podem atrasar temporizadores; o servidor continua garantindo idempotência por UUID.

## Verificações e limites

- Testes automatizados cobrem sucesso parcial, erro persistente após reabrir o banco, sessão expirada, participante conflitante, arquivo ilegível, bloqueio entre conexões, tentativa automática concorrente com a fila manual, recuperação de bloqueio expirado, timeout com resposta tardia e todas as garantias de confirmação da 3.3. As migrações e permissões anteriores continuam testadas em PostgreSQL embarcado.
- Build web de produção.
- Chrome com viewport de celular, duas abas, SDK Supabase real e API simulada: erro offline persistido após recarregar, ausência de envio automático da fila, exclusão entre abas, sucesso parcial, erro de permissão por arquivo, reenvio, navegação para o jogo durante o envio e próxima partida preservada.

Os testes de navegador não gravam no seu Supabase. O fluxo no projeto real e nos aparelhos Android/iOS depende da sua aprovação. Não há serviço de envio em segundo plano do sistema: mantenha o aplicativo aberto durante o envio; ao interrompê-lo, use o botão novamente para confirmar o que ficou pendente.

A consulta pública e as correções administrativas continuam na fase 4. Até lá, confira dados confirmados no Table Editor do Supabase. O resumo local de temporada ainda é temporário e considera somente arquivos que continuam no aparelho.

Nenhum merge na `master` nesta entrega. A implementação pausa ao terminar a 3.4 para sua aprovação antes da fase 4.
