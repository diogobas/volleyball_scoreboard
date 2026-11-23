# Aprovação da subfase 3.2 — cadastro sincronizado e conciliação

Branch: `feat/supabase-sync`. Esta entrega sincroniza grupos e jogadores. Partidas continuam no aparelho, aguardando a subfase 3.3; nenhuma partida é enviada ou apagada nesta entrega.

## Preparação

1. No Supabase do projeto já configurado, abra **SQL Editor → New query**, copie todo o conteúdo de [20261106000200_player_registry_sync.sql](../supabase/migrations/20261106000200_player_registry_sync.sql) e execute **Run**. Resultado esperado: sucesso sem linhas retornadas. Execute somente esta nova migração; a primeira, da 3.1, já foi aplicada. O código não aplica SQL automaticamente no projeto remoto.
2. Na branch indicada, execute `pnpm install --frozen-lockfile` e `pnpm run dev`. A configuração existente de `.env.local` continua válida. Use o mesmo endereço e porta que guardam suas partidas; outro endereço usa outro banco local.
3. Feche outras abas do aplicativo e recarregue. O IndexedDB será atualizado da versão 2 para a 3, preservando partida, histórico, cadastros e Undo. Não limpe os dados do site nem desinstale o app. Em atualização bloqueada, feche as outras abas e tente novamente.
4. Entre em **Account & groups** com uma conta administradora do grupo. Para testar conflitos, prepare outra instalação/perfil de navegador com uma conta também autorizada. Duas abas do mesmo perfil compartilham o banco e não representam dois aparelhos.

## Grupo online e dados anteriores

1. Abra **Players & sync**, use **Refresh groups and players** e escolha seu grupo em **Registry group**. Resultado esperado: nome do grupo, data da atualização e cadastro remoto, inicialmente vazio se ainda não foi usado.
2. Se todos os dados do **Development group** pertencerem a esse grupo, use **Link development data to this group**. Confira o grupo e o número de partidas, teste **Cancel** e depois confirme. Resultado esperado: jogadores e partidas já associados ao grupo de desenvolvimento passam ao grupo escolhido, mantendo UUIDs, datas, placares, nomes históricos e pendências. A partida atual também acompanha a ligação se pertencer ao grupo de desenvolvimento. Essa ligação não pode ser trocada para outro grupo nesta versão.
3. Use **Sync players**. Resultado esperado: jogadores sem conflitos ficam **Saved online**, disponíveis em `public.players` no Supabase. Cadastros continuam no aparelho para uso offline. Nomes conflitantes exigem confirmação; não são unidos automaticamente.
4. Abra **Teams & players**. Resultado esperado: grupo real e jogadores nos seletores. Em partidas com eventos, o grupo fica bloqueado; entre sets, as trocas de jogadores continuam disponíveis. Uma partida nova sem eventos permite escolher outro grupo e selecionar novamente as 12 pessoas.
5. Em **History**, confira placares, datas, detalhes e pendências anteriores. Em **Season statistics → Statistics group**, escolha o grupo real e compare os totais. Resultado esperado: partidas permanecem locais e aguardando envio. O resumo local continua temporariamente disponível; seu destino permanece a página pública da fase 4.

Partidas antigas sem associação não são atribuídas ao grupo automaticamente. Use **History → Associate players** e selecione explicitamente grupo e jogadores, como antes.

## Uso offline e tentativas posteriores

1. Com o grupo já baixado, ative modo avião/desconecte a rede. Feche e reabra o aplicativo instalado ou recarregue onde a versão web estiver disponível. Resultado esperado: partida salva e cadastro baixado permanecem utilizáveis. A versão web precisa conseguir carregar seus arquivos; esta subfase não acrescenta instalação PWA nem cache de arquivos do site.
2. Em **Teams & players**, cadastre uma pessoa com nome distinto. Cancele a edição e reabra. Resultado esperado: o cadastro permanece; **Players & sync** o mostra pendente.
3. Jogue, encerre o set e use **Close match** sem internet. Resultado esperado: partida arquivada localmente e próxima partida preparada; ninguém é apagado por falta de conexão.
4. Reconecte e use **Players & sync → Sync players**. Resultado esperado: cadastro enviado, partidas ainda locais. Repita o botão: o mesmo UUID não cria outro jogador.
5. Cadastre outra pessoa e feche uma partida online. Resultado esperado: o cadastro é atualizado automaticamente após salvar a partida local. Em falha, a partida continua salva e o aviso orienta repetir pelo painel. Não há envio automático de partidas nesta subfase.

O acesso offline usa a última autorização confirmada no aparelho. O servidor verifica sessão e permissão novamente em cada operação online. Sair da conta remove a identidade ativa do cadastro local, preservando jogos e jogadores; faça login e atualize o grupo para voltar a editar seu cadastro online.

## Dois aparelhos: mesma pessoa

1. Nas duas instalações, entre com administradores, baixe o mesmo grupo e desconecte ambas.
2. Cadastre o mesmo nome inédito nas duas. Use esse jogador na escalação e registre pontos; se possível, feche uma partida em cada instalação. Resultado esperado: cada instalação mantém seu próprio UUID pendente e seus pontos.
3. Reconecte a primeira e use **Sync players**; depois faça o mesmo na segunda. Resultado esperado: a primeira grava o jogador; a segunda mostra **Needs identity confirmation**, com o cadastro existente. Não deve atribuir pontos automaticamente à outra identidade.
4. Na segunda, escolha **Same person — use existing registration**. Cancele uma vez; depois confirme **Confirm same person**. Resultado esperado: autores dos pontos e escalações atuais/arquivadas passam ao UUID confirmado, sem mudar placares, datas ou nomes históricos. A lista passa a mostrar uma única pessoa.
5. Recarregue, confira detalhes e teste **Undo** da partida atual. Resultado esperado: identidades continuam conciliadas e o histórico de desfazer funciona.

Uma união que colocaria a mesma pessoa duas vezes em qualquer escalação é recusada integralmente. Os dados ficam preservados para revisão; não há correção administrativa de partidas nesta entrega. Uma confirmação de conflito que mudou enquanto estava aberta também é recusada.

## Dois aparelhos: pessoas diferentes com o mesmo nome

1. Repita a preparação offline com outro nome igual nas duas instalações e sincronize em sequência.
2. No conflito da segunda, informe um nome distinto com sobrenome e use **Different person — save name and retry**. Resultado esperado: dois jogadores diferentes no servidor e no cadastro baixado, mantendo o UUID local da segunda pessoa e a autoria dos seus pontos. Os nomes já registrados nos pontos antigos são preservados.
3. Atualize o cadastro na primeira instalação. Resultado esperado: ambas as pessoas aparecem para seleção. Se continuar usando um primeiro nome já cadastrado, o app pede selecionar alguém existente ou diferenciar com sobrenome.

## Falhas de acesso

1. Em uma conta administradora de teste, crie um jogador offline; usando outra conta administradora, revogue o acesso da primeira.
2. Reconecte a primeira e tente atualizar/sincronizar. Resultado esperado: o servidor recusa o envio; pendência, pontos e partidas continuam no aparelho. Depois da atualização de permissões, a edição do grupo fica bloqueada para aquela conta.
3. Reautorize a conta e atualize novamente. Resultado esperado: o cadastro pendente pode ser enviado sem recriar a pessoa. Uma sessão expirada pode exigir entrar novamente; nunca exige apagar o banco local.

## Verificações da implementação

- `pnpm test`: regras, persistência, migração do IndexedDB, dois bancos locais independentes, tentativas após resposta perdida, conflitos, remapeamento transacional, Undo, troca de conta, permissões e RPCs SQL em PostgreSQL embarcado.
- `pnpm run build`: build web de produção.
- Chrome com viewport de celular e o SDK Supabase real contra respostas simuladas: ligação de dados antigos, envio do cadastro, duas opções de conciliação, uso offline, atualização ao fechar partida, histórico preservado e totais do grupo após recarregar.

O SQL novo ainda precisa ser aplicado e aprovado no projeto Supabase real. Os testes de navegador usam dados simulados, sem gravar no seu projeto. Android/iOS físicos e o roteiro com dois aparelhos reais dependem da sua validação. Nenhum merge na `master` é feito nesta entrega. A subfase 3.3 só começa após aprovação explícita.
