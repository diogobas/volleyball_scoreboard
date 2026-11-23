# Aprovação da subfase 3.3 — envio imediato e confirmação segura

Branch: `feat/supabase-sync`. Fechar uma partida de um grupo online salva primeiro no IndexedDB e só depois tenta enviá-la. O servidor grava a partida inteira em uma transação. A cópia local sai somente após receber confirmação do UUID, grupo e conteúdo enviado. Jogadores e a próxima partida permanecem no aparelho.

## Preparação

1. No projeto Supabase já usado nas etapas anteriores, abra **SQL Editor → New query**. Execute todo o arquivo [20261106000300_atomic_match_submission.sql](../supabase/migrations/20261106000300_atomic_match_submission.sql). Resultado esperado: sucesso sem linhas retornadas. Execute somente esta nova migração, uma vez; as migrações 3.1 e 3.2 já devem estar aplicadas.
2. Na branch indicada, execute `pnpm install --frozen-lockfile` e `pnpm run dev`. Abra o mesmo endereço/porta que já contém os dados. Feche outras abas antigas e recarregue. Não é necessário recriar o projeto, contas ou grupos; `.env.local` permanece válido. O banco local continua na versão 3.
3. Em **Account & groups**, entre como administrador. Em **Players & sync**, atualize o grupo e sincronize os jogadores. Resolva qualquer conflito que envolva os participantes da partida. Cadastros de pessoas sem relação com essa partida não impedem o envio se estiverem em conflito.
4. Em **Teams & players**, confira se a partida usa o grupo online correto, com seis pessoas diferentes por time. Partidas do Development group ou ainda sem associação continuam somente locais. Se necessário, faça a ligação explícita dos dados de desenvolvimento conforme o roteiro da 3.2.

## Fechamento online

1. Conectado à internet, registre alguns pontos, incluindo um de **Opponent’s error**. Use **Close set** e confirme. Resultado esperado: set encerrado e pontuação individual mantida.
2. Se desejar, troque jogadores entre os times antes de pontuar no segundo set; registre e encerre outro set. Inclua um empate para validar que não acrescenta vitória a nenhum time.
3. Abra **Close match**, confira o resumo e confirme **Save and start new match**. Resultado esperado: a partida é salva localmente e a próxima começa com os mesmos jogadores e lados, sem esperar pela rede. Durante o envio, a interface informa que a cópia local está sendo mantida.
4. Aguarde **Match confirmed online. Its local copy has been removed; players remain available offline.** Resultado esperado: somente essa partida é removida de **History**. Pendências anteriores permanecem. **Teams & players** continua mostrando o cadastro, e a nova partida mantém seus pontos, inclusive se você pontuou enquanto aguardava a resposta.
5. No Supabase, abra **Table Editor → matches**. Localize a partida por `closed_at`/grupo e copie seu `id`. Resultado esperado: uma única linha, `version = 1`, resultado em `sets_a`/`sets_b`, datas e `snapshot` com os dados públicos da partida.
6. Filtre `match_sets`, `set_players` e `match_points` por esse `match_id`. Resultado esperado: todos os sets, 12 jogadores por set com suas identidades e posições, e os pontos em sequência. Erro adversário tem `is_opponent_error = true`, `player_id` e `player_name` nulos. Sets empatados não concedem vitória. Nomes históricos são preservados.
7. Recarregue o aplicativo. Resultado esperado: nova partida preservada e arquivo confirmado ausente do histórico local. O cadastro continua disponível offline.

O `snapshot` remoto é um formato público com cabeçalho e sets; ele não contém a sessão, os administradores ou o histórico de Undo do aplicativo. A autoria do envio e a submissão original ficam em `private.match_metadata`, sem leitura direta por clientes. O servidor calcula o resultado pelos sets e valida placares contra os pontos, participantes e grupo.

## Sem conexão e falhas

1. Desconecte a internet/modo avião, registre e encerre um set e feche a partida. Resultado esperado: partida completa em **History**, **Awaiting upload**, próxima partida iniciada. Não ocorre envio nem remoção.
2. Reconecte e abra **Players & sync** ou recarregue o app. Resultado esperado: a partida anterior continua pendente; recuperar conexão e sincronizar jogadores não enviam a fila de partidas.
3. Feche uma nova partida online. Resultado esperado: somente essa nova partida é enviada e removida após confirmação; a partida offline anterior permanece.
4. Para simular falha com o navegador ainda indicando conexão, no DevTools abra **Network → Request blocking** e bloqueie `*rest/v1/rpc/submit_match*`. Feche outra partida online. Resultado esperado: aviso **Match upload was not confirmed**, jogo arquivado inteiro no aparelho e nova partida disponível. A requisição bloqueada pode levar alguns segundos para terminar. Remova o bloqueio depois do teste.
5. Recarregue e confira o arquivo pendente. Resultado esperado: placares, participantes e pontos preservados. Um cadastro com conflito entre participantes também impede o envio e mantém o arquivo local para revisão em **Players & sync**.

O botão para enviar partidas já pendentes será entregue na 3.4. Nesta subfase, não há botão de reenvio nem envio automático da fila anterior. Não apague dados locais para repetir os testes: as pendências serão aproveitadas na próxima entrega.

## Reenvios e proteção de correções

As verificações automatizadas simulam servidor salvo com resposta perdida e repetem o mesmo UUID. A RPC devolve `already_saved` e a confirmação da submissão original, sem criar linhas novas. Um UUID reutilizado com conteúdo diferente é recusado. Mesmo após uma correção futura aumentar `version`, o reenvio do original apenas confirma o recebimento; não altera os resultados corrigidos.

No aparelho, uma confirmação com UUID, grupo, versão ou conteúdo divergente não remove nada. Se o arquivo local mudar durante o envio, ele permanece. Se a remoção local falhar depois da confirmação, o arquivo permanece e pode ser confirmado novamente sem duplicar a partida quando o reenvio estiver disponível.

## Verificações e limites

- `pnpm test`: migrações em PostgreSQL embarcado com RLS e permissões reais, gravação completa, rejeição/rollback de dados inválidos no meio do envio, UUID idempotente e correção preservada; testes em IndexedDB simulado para resposta perdida, conta trocada, confirmação divergente, arquivo alterado, falha na limpeza e preservação da próxima partida e das demais pendências.
- `pnpm run build`: build web.
- Chrome em viewport de celular com SDK Supabase real e API simulada: fechamento offline, nenhuma drenagem automática da fila antiga, envio com confirmação atrasada, pontos na próxima partida durante o envio, confirmação divergente preservada, reenvio do UUID e recuperação após recarregar.

A nova migração não foi aplicada automaticamente no seu projeto. O teste com o Supabase hospedado e Android/iOS físicos aguarda sua validação. A página de consulta remota entra na fase 4; até lá, confira os dados enviados pelo Table Editor. O resumo local de temporada considera somente partidas ainda no aparelho e diminui quando um arquivo é confirmado/removido; ele não representa o total remoto. A consulta de temporada continua destinada à página pública, conforme sua preferência.

Nenhum merge na `master` nesta entrega. A implementação pausa aqui até a aprovação explícita da 3.3.
