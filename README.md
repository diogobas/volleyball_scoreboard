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

- Dois times com seis jogadores cada. Partidas antigas mantêm seus elencos até a associação explícita aos jogadores cadastrados.
- Um toque no jogador adiciona um ponto ao time e às estatísticas individuais.
- “Opponent’s error” adiciona um ponto ao time da coluna selecionada.
- Placar do set, sets vencidos e pontos acumulados por jogador.
- “Switch sides” (botão com texto e setas horizontais) troca os times de lado na tela, acompanhando a posição dos jogadores na quadra. Cores, pontos e estatísticas permanecem vinculados ao mesmo time. A posição é salva e mantida ao reiniciar a partida; a troca manual não entra no histórico de pontos. Ao encerrar um set, os times trocam de lado automaticamente, tanto no fechamento automático quanto no manual. Desfazer esse fechamento restaura os lados anteriores; sets salvos antes desse recurso mantêm o comportamento anterior.
- Fechamento automático dos sets a partir de 25 pontos, com vantagem mínima de 2, sem limite máximo. O botão “Close set” permite encerrar manualmente com outro placar, mediante confirmação; os totais individuais da partida são mantidos.
- Desfazer pontos e o fechamento do último set, em ordem inversa.
- **Teams & players** permite cadastrar jogadores offline e selecionar as 12 pessoas da partida. Cada jogador tem UUID permanente dentro de um grupo; posições no time continuam compatíveis com as partidas antigas. A mesma pessoa não pode ocupar duas posições. Nomes repetidos geram aviso para escolher a pessoa existente ou cadastrar outra com sobrenome. Na tela do jogo, os jogadores aparecem em ordem alfabética, considerando acentos e maiúsculas equivalentes; “Opponent’s error” permanece por último.
- Entre sets, **Teams & players** permite trocar pessoas entre os times e selecionar substitutos. Cada set registra sua escalação. Os pontos continuam vinculados à pessoa que marcou; quem saiu permanece nas estatísticas. O Top 3 soma os pontos por pessoa entre os dois times, enquanto as listas por time mostram a contribuição naquele time. Undo desfaz a alteração de escalação antes de reabrir o set anterior.
- Estatísticas por jogador e histórico de sets. Cada set encerrado pode ser expandido para mostrar o ranking de todos os jogadores que pontuaram naquele set, entre os dois times, excluindo erro adversário; empates compartilham a posição. A aba Statistics usa toda a largura disponível, sem o placar do set. No topo, o Top 3 mostra os três maiores pontuadores da partida entre os dois times, excluindo erro adversário e jogadores ainda sem pontos. Empates mostram a mesma posição; a seleção mantém a ordem original dos times e jogadores, independentemente da troca de lados.
- Reiniciar a partida com confirmação, preservando os nomes.
- “Close match” salva a partida encerrada no aparelho e começa outra, preservando nomes, jogadores e lados. Exige ao menos um set encerrado e nenhum set aberto com pontos. A confirmação mostra resultado, sets e pontos por jogador; empates são permitidos. A partida encerrada e a próxima são gravadas em uma única transação: se falhar, a partida atual permanece. “Undo” da nova partida não desfaz esse fechamento. Em grupos online, o envio da partida recém-fechada é tentado depois dessa gravação local; falhas mantêm o arquivo para envio posterior.
- **Public results** abre o histórico confirmado por grupo, temporadas e detalhes por set, sem login. A aba History foi retirada do aplicativo na 4.1; pendências são geridas em **Players & sync → Pending uploads**, com estado, erros e envio manual, sem consulta de resultados antigos.
- A página pública mostra pontos, partidas, vitórias e dias de presença por jogador, com filtro por ano e fuso do grupo. Considera apenas partidas confirmadas no servidor; várias partidas no mesmo dia contam uma presença. Quem jogou pelos dois times não recebe vitória individual naquela partida. O resumo local de temporada foi removido do app.
- Interface em inglês, com layout responsivo para celular, desktop e orientação horizontal. A primeira tela prioriza os pontos do set e as duas listas de jogadores, incluindo erro adversário. Na vertical, o placar ocupa cerca de um terço da altura útil e os jogadores os dois terços restantes; o tamanho dos pontos aproveita essa área e reserva espaço para dois dígitos, sem diminuir ao passar de 9 para 10. Na horizontal, as listas de jogadores ficam nas extremidades, com largura baseada em 16 caracteres (a referência é “Opponent’s error”), mais espaço para o contador de pontos e as margens. O placar geral ocupa o espaço restante no centro, com números de 128–360 px ajustados ao espaço, com a mesma fonte para um ou dois dígitos. Os nomes dos times não aparecem na tela de pontuação; a identificação acessível e as cores acompanham a troca de lados.
- A lista de jogadores se expande para aproveitar a altura útil da tela, respeitando as áreas seguras do aparelho. Os botões dividem esse espaço igualmente e mantêm pelo menos 44 px de altura na vertical e 48 px na horizontal. Em telas muito baixas, com nomes longos ou texto ampliado, a página permite rolagem para preservar os alvos de toque.
- Undo, Close set, Close match, Teams & players e Switch sides ficam depois dos jogadores; as abas Game/Statistics vêm depois dessas ações. Ao selecionar uma aba, a visualização volta ao início da área do placar e do conteúdo selecionado.
- Histórico de pontos recolhido por padrão; toque em “Recent points” para expandir. O histórico não aumenta a altura da tela enquanto está recolhido.
- Salvamento automático transacional em IndexedDB, incluindo o histórico necessário para desfazer após recarregar. Partidas da versão anterior são migradas do `localStorage`; a cópia antiga é preservada para recuperação, mas não é atualizada nem substitui os dados do novo banco.
- Fontes distribuídas no próprio build, sem dependência do Google Fonts em tempo de execução.

Todos os sets usam a regra solicitada de 25 pontos com diferença mínima de dois: 25 × 23 encerra, 25 × 24 continua e 26 × 24 encerra. Não há regra especial de 15 pontos para set decisivo nem fim da partida por melhor de três/cinco. Um set empatado pode ser fechado manualmente e não acrescenta vitória a nenhum time. O fechamento automático entra no histórico: “Undo” reabre o set com o placar final; outro “Undo” retira o último ponto. Partidas salvas anteriormente preservam os sets e pontos registrados, mesmo fora da nova regra.

Partidas recém-fechadas de grupos online são enviadas ao Supabase quando há conexão; até confirmar o envio, ficam no navegador/dispositivo e na origem usada para acessar o app. O cadastro de jogadores pode ser sincronizado com o Supabase e fica disponível localmente para uso offline. Limpar os dados do site apaga os dados locais; mudar de endereço, porta ou dispositivo não transfere partidas. Contas e administração de grupos estão disponíveis desde a subfase 3.1; a 3.2 acrescenta sincronização do cadastro, a 3.3 envia a partida recém-fechada e a 3.4 permite enviar pendências anteriores pelo botão manual, que na 4.1 fica em Players & sync → Pending uploads. Recuperar conexão não envia a fila automaticamente.

### Banco local — subfase 1.1

O banco `volleyball-scoreboard` usa versão 3, com os armazenamentos `activeMatches` (partida atual), `closedMatches` (partidas encerradas), `groups`, `players` e `settings` (grupo selecionado e identidade da sessão usada no cache). A versão 2 adicionou os cadastros; a versão 3 preserva esses dados e permite que identidades locais e remotas com nomes iguais coexistam até a confirmação do usuário. O cadastro local continua recusando nomes repetidos. Nenhuma atualização associa partidas automaticamente. Os registros de partida mantêm `formatVersion: 1`, com campos opcionais para grupo e identidades permanentes. O placar só é liberado depois de concluir a leitura/migração. Uma falha de leitura não inicia uma partida vazia sobre os dados existentes; a tela oferece tentar novamente. Falhas de gravação mostram um aviso com **Retry saving**; mantenha o app aberto até salvar com sucesso.

O app solicita armazenamento persistente quando a plataforma oferece essa API, mas a concessão depende do navegador. Desinstalar o app ou limpar seus dados ainda pode apagar a partida. Ao sair, aguarde **Saved on this device**. A cópia antiga no `localStorage` representa somente o estado anterior à migração; voltar para uma versão antiga do aplicativo não recupera os pontos feitos depois dela.

Roteiro de aprovação: [testar a subfase 1.1](docs/testing-local-storage-1.1.md).

### Fechar partida — subfase 1.2

O botão **Close match** fica disponível depois de salvar os pontos e encerrar todos os sets com pontuação. Confira o resumo e use **Save and start new match**. Durante a gravação, a confirmação fica bloqueada para impedir envios repetidos. Só depois de concluir a transação o app exibe a nova partida e a mensagem de sucesso. Se ocorrer erro, a confirmação permanece aberta para tentar novamente ou cancelar.

Cada registro em `closedMatches` contém UUID, `formatVersion: 1`, data de fechamento (`closedAt`), estado completo da partida e `syncStatus: 'pending'`. O aplicativo não envia nem apaga esses registros nesta fase. Eles podem ser consultados na aba **History** ou inspecionados nas ferramentas do navegador.

**Reset match** continua descartando a partida em andamento, sem arquivá-la; para guardá-la, use **Close match**. Partidas já arquivadas não são afetadas pelo reset ou pelos pontos da próxima partida. Um fechamento detectando alteração do registro atual por outra aba é recusado; recarregue e confira o jogo antes de tentar novamente.

Roteiro de aprovação: [testar a subfase 1.2](docs/testing-close-match-1.2.md).

### Histórico e pendências — subfase 1.3

A aba **History** consulta novamente o banco local sempre que é aberta. Mostra o total de partidas salvas, o total aguardando envio e uma lista com data de fechamento no fuso do aparelho e resultado em sets. **View details** abre uma consulta do vencedor/empate, placares de cada set, participantes e pontos individuais, incluindo erros adversários separados. As ações de jogo e reset ficam disponíveis nas abas Game/Statistics; o histórico é apenas para consulta.

Todas as partidas encerradas normalmente nesta fase ficam como **Awaiting upload**; a interface informa que o envio remoto ainda não está disponível. Uma falha ao ler o histórico oferece **Retry** e não altera o jogo atual. Um registro inválido aparece com aviso, preservando seus dados e permitindo consultar os demais. Fechar uma partida atualiza a lista ao abrir History; recarregar ou reiniciar o app mantém os dados na mesma instalação/origem.

Roteiro de aprovação: [testar a subfase 1.3](docs/testing-match-history-1.3.md).

### Cadastro e identidades — subfase 2.1

Abra **Teams & players** para usar o **Development group**, um grupo de teste somente local. O banco já separa jogadores por grupo, mas criação/seleção de grupos reais e acesso administrativo serão conectados ao servidor na fase 3. O grupo de desenvolvimento é criado uma única vez, com fuso do aparelho; nenhum nome do elenco antigo vira cadastro automaticamente.

**Register player** salva o nome no aparelho imediatamente, com UUID, grupo, nome normalizado e estado pendente. O nome tem até 60 caracteres. A comparação ignora acentos, maiúsculas e espaços excedentes. Um nome repetido é recusado; um primeiro nome isolado também gera aviso quando já existe alguém com esse primeiro nome. Nomes completos diferentes podem coexistir. O aviso oferece usar a pessoa existente na última posição selecionada ou informar sobrenome para outra pessoa. Cadastros já confirmados permanecem mesmo ao cancelar as alterações da escalação.

Selecione uma pessoa diferente em cada uma das 12 posições e confirme **Save**. Para partidas antigas em andamento, isso associa todos os pontos anteriores de cada posição à pessoa escolhida, preservando seus contadores e os nomes no histórico de pontos. Confira todas as posições antes de salvar. Os nomes dos times continuam editáveis. A próxima partida preserva os UUIDs e permite reorganizar o elenco antes de pontuar. A partir da subfase 2.2, também é possível reorganizar os times entre sets.

Em **History**, partidas ainda sem grupo oferecem **Associate players**. A associação é explícita, transacional e preserva UUID da partida, data de fechamento, pendência, nomes originais, sets e pontos; acrescenta somente o grupo e as identidades dos participantes e autores dos pontos. Não altera o jogo atual. Nesta versão, a associação de uma partida arquivada só pode ser feita uma vez; correções administrativas serão implementadas depois. Falhas de gravação não aplicam associação parcial. Partidas antigas ainda não associadas continuam disponíveis para jogar e consultar.

Roteiro de aprovação: [testar a subfase 2.1](docs/testing-player-registry-2.1.md).

### Trocas entre sets — subfase 2.2

Após encerrar um set (automaticamente ou com **Close set**), abra **Teams & players**, selecione os jogadores nas novas posições e confirme **Save**. É possível trocar pessoas entre times ou registrar/selecionar alguém de fora; permanecem seis por time e 12 pessoas diferentes em quadra. Com pontos no set atual, os seletores ficam bloqueados até encerrá-lo ou desfazer seus pontos. Não é necessário fechar a partida para trocar os jogadores.

As alterações de escalação entram no histórico como **Lineup changed**, preservando escalações anterior e seguinte e o set a que se aplicam. **Undo** desfaz a última troca; outro Undo pode reabrir o set anterior com sua escalação e seus pontos. Várias mudanças antes do próximo ponto são desfeitas na ordem inversa. A troca visual de lados permanece independente da escalação.

Cada set de partida associada contém seus seis jogadores por time. O resumo de fechamento, **History → View details** e o histórico de sets em **Statistics** mostram essas escalações. Quem saiu ou não pontuou permanece registrado como participante dos sets em que jogou. Selecionar alguém depois do último set, sem jogar outro ponto, não o inclui nos participantes da partida encerrada; ele fica preparado para o próximo jogo.

Pontos individuais são somados por UUID. O Top 3 tem uma entrada por pessoa, incluindo quem atuou pelos dois times ou saiu; cada lista por time mostra somente os pontos feitos por aquela pessoa naquele time. Ao fechar a partida, o arquivo mantém todo esse histórico e a nova partida começa com a escalação mais recente e contadores zerados. Partidas anteriores continuam legíveis; se já estavam associadas, a escalação fixa de cada set é reconstruída ao ler seu histórico. Não há inferência de identidade em partidas ainda não associadas.

Na subfase 2.2, o banco permaneceu na versão 2; a 3.2 o atualiza para a versão 3. O estado acrescenta `initialRoster` quando necessário, eventos `roster` e escalações nos eventos de fechamento de set; o replay valida e restaura as alterações e pontos em sequência.

Roteiro de aprovação: [testar a subfase 2.2](docs/testing-lineup-changes-2.2.md).

### Estatísticas individuais e temporadas — subfase 2.3

Na aba **History**, **Season statistics** mostra a tabela local do grupo de desenvolvimento e um seletor de temporada. A temporada inicial é o ano atual no fuso do grupo; também aparecem anos com partidas associadas. A tabela inclui jogadores cadastrados ainda sem participação e mantém participantes históricos mesmo se não estiverem no cadastro carregado. A ordenação é por pontos, vitórias e nome. Em telas estreitas, a tabela permite rolagem horizontal dentro do próprio quadro.

**Direção aplicada na 4.1:** a consulta de estatísticas de temporada (pontos, partidas, vitórias e frequência) foi movida para a página pública por grupo, usando somente dados remotos confirmados. A tabela local temporária e a aba History foram removidas do aplicativo. As regras locais permanecem como referência de testes para comparar os cálculos no servidor. Essa mudança se refere ao resumo de temporada; o placar, as estatísticas da partida atual e a gestão de partidas pendentes continuam no aplicativo. A subfase 2.3 foi validada pelo usuário no computador; a validação em aparelhos permanece pendente.

- **Points** soma pontos atribuídos ao UUID da pessoa, incluindo os dois times; exclui erros adversários.
- **Matches** conta uma partida por pessoa que participou de pelo menos um set com pontuação, mesmo sem pontuar. Quem saiu conta; quem só foi selecionado após o último set, sem jogar, não conta.
- **Wins** conta uma vitória para quem atuou exclusivamente no time com mais sets vencidos. Empates e participação pelos dois times não concedem vitória. Entrar como substituto também permite vitória, se participou somente pelo time vencedor.
- **Days** conta datas distintas de participação no grupo, com uma presença mesmo quando houve várias partidas naquele dia. Não representa percentual de frequência nem uma chamada separada.

A data de início é registrada em UTC no primeiro ponto de cada nova partida (`state.startedAt`), incluindo ponto por erro adversário. O ano e a data de presença são calculados no fuso persistido do grupo, independentemente do fuso do aparelho que consulta. Essa data permanece ao recarregar e atravessar sets; desfazer todos os pontos remove o início, e reset/fechamento preparam outra partida sem data até o primeiro ponto.

Partidas de versões anteriores podem não ter data de início. Elas usam `closedAt` como aproximação e a tela informa quantas partidas da temporada usam essa regra. Partidas antigas em andamento não recebem um início inventado no próximo ponto. Associar um arquivo antigo mantém suas datas e o inclui na tabela ao atualizar History. Partidas sem associação ou ilegíveis ficam fora dos totais, com avisos explicando a exclusão. A partida em andamento também fica fora.

Os totais são derivados dos arquivos locais a cada consulta, sem gravar contadores acumulados ou alterar as partidas. A associação atualiza a consulta, e futuras correções poderão recalcular os resultados sem contagem duplicada. Falha ao carregar o cadastro oferece **Retry**, mantendo a lista de partidas disponível. Não há sincronização nem estatísticas de outros aparelhos nesta entrega.

Roteiro de aprovação: [testar a subfase 2.3](docs/testing-season-statistics-2.3.md).

### Supabase e administradores — subfase 3.1

**Account & groups**, abaixo das abas, oferece cadastro, login por e-mail/senha e saída da conta neste aparelho. O responsável cria um grupo e se torna seu primeiro administrador; pode autorizar outras contas confirmadas por e-mail e revogar acessos. O servidor impede remover o último administrador. Cadastrar uma conta não concede acesso a grupos de outras pessoas. A lista **My groups** mostra apenas os grupos administrados pela conta conectada.

Sem configuração online, o placar continua disponível e o diálogo informa que as contas não estão configuradas. O cliente online é carregado quando o diálogo é aberto. Sessão de autenticação e dados de partida têm armazenamentos separados; sair da conta não apaga partidas. O grupo de desenvolvimento e seus cadastros locais só se vinculam a um grupo online mediante confirmação explícita em **Players & sync**, disponível na subfase 3.2.

A migração [20261106000100_groups_and_match_schema.sql](supabase/migrations/20261106000100_groups_and_match_schema.sql) cria as tabelas públicas de grupos, jogadores, partidas, sets, escalações e pontos, com RLS e vínculos por grupo. O schema `private` contém administradores, autoria dos envios e revisões; suas tabelas não têm acesso direto pelos clientes. Funções administrativas validam `auth.uid()` e o vínculo ao grupo no servidor. A criação do grupo e a autorização inicial são atômicas; autorizar outro administrador exige uma conta com e-mail confirmado. Não há chave administrativa no aplicativo.

Use `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, conforme [.env.example](.env.example). A configuração também aceita uma chave `anon` legada em `VITE_SUPABASE_ANON_KEY`. O build recusa chaves secretas ou `service_role` nas configurações públicas. A segurança de acesso é aplicada por permissões/RLS e RPCs no banco, não pela validação da chave no frontend. Consulte as [chaves Supabase](https://supabase.com/docs/guides/getting-started/api-keys) e as [políticas RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

O projeto remoto precisa ser criado e a migração aplicada antes do teste online; ambos ficam sob sua conta Supabase. A gravação transacional de partidas será implementada na 3.3; nesta etapa, o cliente não recebe escrita direta nas tabelas de partidas. A página pública fica para a fase 4.

Configuração e roteiro de aprovação: [testar a subfase 3.1](docs/testing-supabase-admin-3.1.md).

### Cadastro sincronizado e conciliação — subfase 3.2

**Players & sync** baixa os grupos administrados e o cadastro do grupo escolhido. **Teams & players** permite selecionar um grupo e cadastrar pessoas localmente; após a primeira configuração online, o cadastro e a última autorização confirmada ficam disponíveis offline. O grupo de uma partida com eventos não pode ser trocado. Selecionar outro grupo numa partida nova exige escolher novamente as 12 pessoas.

Aplique a nova migração [20261106000200_player_registry_sync.sql](supabase/migrations/20261106000200_player_registry_sync.sql) depois da 3.1. As RPCs `get_group_registry` e `sync_group_player` verificam administrador e sessão no servidor. O cadastro usa o mesmo UUID no aparelho e no servidor; repetir uma tentativa não duplica o jogador. Escritas diretas em `players` pelo cliente são revogadas para exigir o tratamento de conflitos da RPC.

**Link development data to this group** pede confirmação antes de mover os cadastros e partidas já associados ao Development group para um grupo real. Preserva IDs, placares, datas e nomes históricos; não atribui automaticamente partidas sem associação. A ligação vale para todos os dados desse grupo local e não pode ser trocada nesta versão. Cadastro e partidas afetadas são atualizados numa transação única. Vínculos persistentes também conciliam identidades em gravações posteriores de estados antigos.

**Sync players** envia cadastros pendentes e mantém a cópia local. Nomes concorrentes geram **Needs identity confirmation**. Para a mesma pessoa, confirme o uso da identidade existente: pontos e escalações atuais e arquivados acompanham esse UUID, preservando os nomes originais. Para pessoas diferentes, informe um nome distinto com sobrenome e tente novamente; o UUID local permanece. A operação inteira é recusada se uma união repetir a pessoa numa escalação. Não há união automática de pessoas.

O cadastro é atualizado ao abrir o grupo online, sincronizar pelo botão e depois de fechar uma partida online. Falhas preservam dados e permitem tentar novamente; sair da conta não apaga o cache nem partidas, mas remove a identidade ativa para editar grupos online. A permissão offline representa a última confirmação, enquanto o servidor revalida cada chamada. **Season statistics** permite escolher o grupo do resumo local temporário.

Na entrega 3.2, as partidas continuavam **Awaiting upload** no aparelho; a subfase 3.3 acrescenta envio imediato e limpeza após confirmação, descritos abaixo. A versão web ainda depende de conseguir carregar seus arquivos para abrir; esta entrega não cria cache PWA.

Preparação e roteiro de aprovação: [testar a subfase 3.2](docs/testing-player-sync-3.2.md). A 3.1 foi validada pelo usuário no projeto real; a nova migração e o fluxo de cadastro remoto aguardam sua aplicação e aprovação.

### Envio imediato e confirmação segura — subfase 3.3

Aplique [20261106000300_atomic_match_submission.sql](supabase/migrations/20261106000300_atomic_match_submission.sql) depois das duas migrações anteriores. **Close match** primeiro arquiva e prepara a próxima partida em uma transação local. Somente após o commit, para um grupo online e com conexão, sincroniza o cadastro e tenta enviar aquele UUID. Não envia partidas antigas ao abrir o aplicativo, restaurar conexão ou sincronizar jogadores.

A RPC `submit_match` exige administrador atual do grupo e grava partida, sets, 12 participantes por set e todos os pontos em uma transação. Deriva o resultado dos sets, valida pontos contra placares e escalações e rejeita campos extras no conteúdo público. O `snapshot` remoto usa um envelope com datas, nomes de times e sets; dados de conta e Undo não são enviados. A autoria e a submissão original são privadas.

UUIDs repetidos com o mesmo conteúdo recebem confirmação sem duplicar dados. O servidor guarda a submissão original separada do resultado editável: reenviar o original nunca sobrescreve uma correção administrativa futura. Reutilizar o UUID com conteúdo diferente é recusado. Falha em qualquer ponto da transação reverte a partida inteira.

O app confere UUID, grupo, versão e conteúdo original da confirmação, e só então remove o arquivo fechado, se ele ainda corresponde à cópia enviada. Resposta perdida, sessão alterada, conflito, erro remoto ou falha de remoção preservam os dados locais; uma nova tentativa pode confirmar o mesmo UUID. A partida em andamento, os cadastros e outros arquivos nunca são removidos por esse envio. O banco local permanece na versão 3.

A interface informa o envio, a confirmação ou a preservação local em caso de erro. **History** lista os arquivos ainda no aparelho. Partidas confirmadas saem da lista e do resumo local de temporada; os totais remotos serão consultados na página pública da fase 4. A fila manual de pendências e sua interface de tentativas estão disponíveis na 3.4, descrita abaixo.

Roteiro de aprovação: [testar a subfase 3.3](docs/testing-match-upload-3.3.md). A nova migração aguarda aplicação no projeto real e validação em dispositivos.

### Fila manual e recuperação de falhas — subfase 3.4

**History → Sync pending matches** envia somente após ação do usuário as partidas que estavam pendentes ao iniciar a execução. O processamento segue das mais antigas para as mais recentes e continua após erros individuais. Cada confirmação remove somente seu arquivo; falhas permanecem com mensagem e data da tentativa. O resumo informa confirmadas, falhas e arquivos já em envio ou removidos por outra tentativa. **Refresh saved matches** atualiza a consulta sem enviar nada.

O botão fica bloqueado durante o envio, e cada partida mostra **Uploading**, **Upload failed** ou **Upload interrupted**. O erro persiste após reiniciar. É possível voltar ao jogo durante a execução; não há serviço de envio em segundo plano do sistema. Abrir o app, restaurar conexão, consultar History ou atualizar jogadores não inicia a fila. Partidas novas fechadas durante um lote seguem sua própria tentativa automática online ou aguardam o próximo clique.

Tentativas automáticas e manuais da mesma partida compartilham a execução. Web Locks, quando disponíveis, e bloqueios transacionais em IndexedDB protegem conexões/abas independentes. Os bloqueios são renovados durante o envio e expiram após interrupção; uma tentativa ativa tem limite aproximado de 60 segundos, e um bloqueio deixado por fechamento pode levar até cerca de 90 segundos para liberar. Timeout e perda de controle impedem respostas antigas de apagar arquivos. A proteção por UUID no servidor permanece válida.

Estados e bloqueios ficam em `settings`, separados dos arquivos. Falhas não regravam placares ou históricos. A remoção confirmada do arquivo e do estado da tentativa é atômica, verifica a titularidade do envio e mantém a partida atual e os cadastros. Sessão expirada, falta de permissão, conflito, falha remota ou arquivo ilegível não removem dados nem impedem outras partidas elegíveis.

Não há nova migração SQL nesta subfase; as três anteriores precisam estar aplicadas. O banco local permanece na versão 3. A página pública e correções administrativas entram na fase 4.

Roteiro de aprovação: [testar a subfase 3.4](docs/testing-pending-sync-3.4.md).

### Consulta pública — subfase 4.1

Na branch `feat/public-stats-admin`, a página pública usa o mesmo build com navegação por hash: `/#/groups` lista grupos, `/#/groups/<UUID>` abre a temporada e `/#/groups/<UUID>/matches/<UUID>` abre a partida. Parâmetros `season` e `page` preservam filtros e paginação em links diretos. A URL padrão e `/#/app` abrem o placar.

Aplique [20261106000400_public_statistics.sql](supabase/migrations/20261106000400_public_statistics.sql) depois das três migrações anteriores. As funções `public_group_summary` e `public_match_details` são somente leitura, executadas como o visitante e sujeitas às políticas públicas de RLS. O cliente da consulta pública é anônimo, sem persistência/renovação de sessão, separado do cliente de administração. Abrir uma rota pública não acessa o banco local nem exige conta.

A consulta calcula pontos individuais, partidas, vitórias e dias a partir dos sets, participantes e pontos confirmados. Preserva as regras aprovadas de participação sem pontos, frequência por dia no fuso do grupo, empate e ausência de vitória individual para quem atuou nos dois times. Totais da temporada consideram todos os jogos; a lista pagina 25 partidas por vez, sem truncar os totais ao limite da Data API. Detalhes mostram as escalações e nomes registrados em cada set, pontuação individual e erros adversários separados. Dados de administradores, autorias e revisões privadas não são retornados.

**History foi removida do aplicativo**, junto com a tabela local de temporada. Game e Statistics continuam mostrando a partida atual. Para enviar arquivos offline, use **Players & sync → Pending uploads → Sync pending matches**. Esse painel exibe apenas grupo, data, estado e erro por pendência, mantendo a associação explícita de arquivos antigos sem grupo. A remoção da interface de histórico não apaga jogos locais. Arquivos pendentes só entram na consulta pública após confirmação remota.

A página tem seleção de temporada, paginação, links diretos, atualização e estados de vazio/erro. O link **Public results** no app abre o grupo atual; **Open scoreboard** retorna ao placar. A publicação continua prevista para a 4.3; a entrega atual é local, para aprovação antes das correções administrativas da 4.2.

Preparação e roteiro: [testar a subfase 4.1](docs/testing-public-results-4.1.md). As seções anteriores documentam a evolução das subfases; onde citam History ou o resumo local, a navegação atual é a descrita aqui.

### Correções administrativas — subfase 4.2

Na página pública de uma partida, **Administrator tools** permite entrar com uma conta já autorizada no grupo e corrigir participantes, autores, pontos e limites dos sets. A sessão web administrativa é separada da conta do placar; as consultas públicas continuam anônimas. Abrir as ferramentas não acessa o IndexedDB do aplicativo.

Aplique [20261106000500_administrative_corrections.sql](supabase/migrations/20261106000500_administrative_corrections.sql) depois das quatro anteriores. As RPCs `get_match_for_edit`, `correct_match` e `match_revision_history` conferem permissão no servidor. A validação e reconstrução dos registros da partida são compartilhadas com o envio inicial por uma função privada, sem execução direta pelos clientes. O contrato de `submit_match` permanece compatível com versões anteriores do aplicativo.

O editor permite substituir pessoas em cada set, reassociando seus pontos naquele time, trocar a autoria de pontos individuais, adicionar/remover pontos e corrigir fechamentos. Divisão e mudança de limite preservam a ordem da sequência; a junção exige os mesmos participantes por time. Todo set tem seis pessoas diferentes por time e pontos com autoria válida ou erro adversário explícito. Placares são derivados dos pontos; grupo, datas e nomes gerais dos times permanecem fixos. Não há exclusão de partidas.

Salvar exige internet, motivo de 1–500 caracteres e revisão **Before/After**. O servidor bloqueia a linha, confere a versão carregada, reconstrói sets, escalações e pontos, incrementa a versão e grava autor, data, motivo e snapshots anterior/novo em uma transação. Erros revertem tudo. A consulta pública recalcula os resultados a partir dos registros atuais. **Private revision history** mostra as revisões somente para administradores do grupo, paginadas em 20 registros.

Uma versão desatualizada é recusada e mantém o rascunho para revisão explícita após **Load latest version**. A tentativa tem UUID próprio: repetir a mesma correção após confirmação perdida não duplica revisões. O envio original permanece imutável em metadados privados; reenvios antigos confirmam sua recepção sem alterar a versão corrigida. Falhas e timeouts não são apresentados como confirmação de salvamento.

Rascunhos ficam em memória enquanto as ferramentas estão abertas. Não há salvamento offline de correções; fechar/recarregar a página perde o rascunho. A consulta pública e o aplicativo continuam sem acesso a motivos ou autorias privadas. A publicação e a validação integrada ficam na 4.3.

Roteiro de aprovação: [testar a subfase 4.2](docs/testing-admin-corrections-4.2.md).

## Verificar e gerar o build

```sh
npm test
npm run build
npm run preview
```

Os testes cobrem regras de jogo, persistência, elencos, temporadas, configuração online e o contrato das RPCs. Também executam as migrações e as permissões SQL em PostgreSQL embarcado, sem depender de credenciais ou Docker. E-mail/Auth/Data API hospedados ainda precisam ser validados no Supabase real. O build é gerado em `dist/`; `preview` permite verificá-lo localmente.

## Atualizações e segurança das dependências

O Dependabot verifica npm, Gradle (`android/`) e GitHub Actions mensalmente, às 07:00 no fuso `America/Toronto`, e abre PRs contra a branch padrão. Cada ecossistema tem limite de três PRs de atualização de versão abertos. React, Vite, Capacitor e Material UI/Emotion são agrupados por família em qualquer versão; as demais atualizações minor/patch são agrupadas, e majors ficam separadas para revisão.

O Gradle Wrapper é uma exceção: atualizações automáticas de major ficam desativadas enquanto o projeto usa Android Gradle Plugin (AGP) 8.13.0. O PR #11 propôs Gradle 9.8.2 isoladamente, mas o AGP atual depende de uma API interna removida no Gradle 9.6. Atualizações minor/patch do Gradle 8 continuam habilitadas; a migração para Gradle 9 deve atualizar também o AGP, validar a compatibilidade com Capacitor e passar no build Android antes de remover essa exceção.

O workflow `CI` executa `npm ci`, testes e build web com Node 22 e 24, verifica se o manifesto iOS está sincronizado e compila o APK Android de debug com Java 21. Cada PR deve ser revisado antes do merge, especialmente mudanças de versão major. O CI não compila nem assina o app iOS; valide atualizações nativas também no Xcode e nos dispositivos.

O manifesto `ios/App/CapApp-SPM/Package.swift` é gerado pelo Capacitor e não recebe atualizações Swift independentes. Em PRs de `@capacitor/*`, execute `npm ci`, `npm run ios:sync` e `npm run android:sync`, atualize os arquivos nativos gerados e resolva as dependências no Xcode antes do merge.

Alertas e correções automáticas de segurança devem permanecer ativados em **Settings > Advanced Security > Dependabot**. Correções de segurança não aguardam a agenda mensal. Para dependências Gradle, alertas de segurança exigem envio do grafo de dependências pela Dependency Submission API; a configuração atual cobre suas atualizações de versão.

Referências: [opções do Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference) e [ecossistemas suportados](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories).

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

### Distribuir pelo teste interno do Google Play

O teste interno permite distribuir pela Play Store para até 100 testadores, por convite. Requer uma conta no Google Play Console. O arquivo enviado é um Android App Bundle (`.aab`) assinado com uma chave de upload.

1. Execute `npm test`, `npm run android:sync` e `npm run android:open`.
2. No Android Studio, aguarde a sincronização do Gradle e abra **Build > Generate Signed Bundle / APK**. Selecione **Android App Bundle**, módulo **app**.
3. No primeiro envio, use **Create new** para criar um keystore, por exemplo `volleyball-upload.jks`, com alias `upload`. Defina as senhas no próprio Android Studio, validade de pelo menos 25 anos e os dados do certificado. Guarde uma cópia do keystore e as senhas em local seguro, fora do Git. Nos próximos envios, selecione essa mesma chave.
4. Escolha a variante **release** e gere o bundle. Use **Locate** na notificação de conclusão para encontrar o `.aab` assinado; o destino depende da pasta escolhida no assistente. Um bundle gerado apenas por `./gradlew :app:bundleRelease` não fica assinado com a configuração atual do projeto.
5. No [Play Console](https://play.google.com/console), selecione **Criar app**, informe `Volleyball Scoreboard`, o idioma padrão inglês, tipo **App** e a opção gratuito ou pago conforme sua distribuição. Preencha as declarações exigidas.
6. Abra **Testar e lançar > Teste > Teste interno** e crie uma versão. Configure o **Play App Signing**, permitindo que o Google gere a chave de assinatura do app, e envie o `.aab` assinado. O identificador enviado será `com.diogobastos.volleyballscoreboard`.
7. Informe as notas da versão, salve, revise os erros indicados pelo Console e inicie o lançamento para teste interno.
8. Na aba **Testadores**, crie e selecione uma lista com os e-mails das Contas Google dos participantes e salve. Copie o link de participação e envie aos testadores. Cada pessoa deve abrir o link com a conta cadastrada, aceitar o teste e instalar pela Play Store. O app não aparece na busca pública durante esse teste.

Sugestão de notas em inglês: `Restored the “Opponent’s error” label on scoring buttons and in recent points.`

O primeiro envio pode usar `versionCode 1` e `versionName "1.0"`, definidos em `android/app/build.gradle`. Para cada novo bundle enviado ao Google Play, aumente o `versionCode` para um número ainda não utilizado. O número de build do iOS é independente.

O teste interno pode começar antes de concluir toda a configuração da página pública. O primeiro link pode levar algumas horas para ficar disponível. Siga as pendências mostradas pelo Console para a sua conta.

Referências: [teste interno do Google Play](https://support.google.com/googleplay/android-developer/answer/9845334?hl=pt-BR) e [assinatura de apps no Android Studio](https://developer.android.com/studio/publish/app-signing).

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

## Distribuir no TestFlight

O target iOS está configurado com o identificador `ca.itelligent.volleyballscoreboard` e a equipe selecionada no Xcode. O identificador Android continua `com.diogobastos.volleyballscoreboard`. Para o TestFlight, use o cadastro do App Store Connect correspondente ao identificador iOS.

- Versão iOS preparada: **1.0, build 2**. O build fica em `CURRENT_PROJECT_VERSION`, nas configurações Debug e Release do projeto Xcode. Aumente esse número antes de cada novo envio; a versão Android é independente.
- O app declara `ITSAppUsesNonExemptEncryption = NO`: o código atual não implementa criptografia própria. Reavalie essa declaração se adicionar recursos de criptografia.
- Execute `npm test` e `npm run ios:sync`. No Xcode, selecione o scheme **App**, destino **Any iOS Device** e **Product > Archive**.
- No Organizer, selecione o archive e use **Distribute App > App Store Connect > Upload**, com a equipe de distribuição que possui o cadastro do app.
- Após o processamento da Apple, abra **App Store Connect > Volleyball Scoreboard > TestFlight** para configurar o grupo de teste e as informações da versão.

Os arquivos gerados localmente ficam em `artifacts/ios/`, ignorados pelo Git. O archive `VolleyballScoreboard-1.0-2.xcarchive` pode ser aberto no Organizer; o IPA exportado fica em `TestFlight-1.0-2/App.ipa`. O TestFlight exige uma assinatura ativa do Apple Developer Program e um cadastro do app no App Store Connect.

Referência: [envio de builds para o App Store Connect](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds).

## Próximas etapas

- Testar o APK em um celular Android físico.
- Definir identificador definitivo e assinatura de release para distribuição.
- Instalar e testar no iPhone físico pelo Xcode.

Referências: [Material UI](https://mui.com/material-ui/getting-started/installation/), [Vite](https://vite.dev/guide/) e [Capacitor Android](https://capacitorjs.com/docs/android).
