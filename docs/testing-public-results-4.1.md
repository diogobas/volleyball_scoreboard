# Aprovação da subfase 4.1 — página pública e retirada de History do app

Branch: `feat/public-stats-admin`, criada sobre `feat/supabase-sync`, sem merge na `master`.

O histórico de partidas confirmadas e a tabela de temporada ficam somente na página pública. O aplicativo mantém Game e Statistics (partida atual), cadastro, contas e a gestão operacional das pendências em **Players & sync → Pending uploads**. A remoção da aba History não apaga partidas, jogadores ou pontos.

## Preparação

1. No projeto Supabase existente, abra **SQL Editor → New query** e execute todo o arquivo [20261106000400_public_statistics.sql](../supabase/migrations/20261106000400_public_statistics.sql). Resultado esperado: sucesso sem linhas retornadas. As três migrações anteriores precisam estar aplicadas; não as execute novamente.
2. Na branch indicada, execute `pnpm install --frozen-lockfile` e `pnpm run dev`. Use a configuração atual de `.env.local` e o mesmo endereço/porta que guarda seus dados. O IndexedDB continua na versão 3. Não limpe dados do site nem desinstale o aplicativo.
3. A página roda no mesmo projeto web, por navegação hash. No endereço exibido pelo Vite, acrescente `/#/groups`, por exemplo `http://localhost:5173/#/groups`. O link **Public results** no app abre diretamente o grupo da partida, quando já associado, ou a lista de grupos.

Esta entrega prepara e testa a página localmente. A publicação/hospedagem continua na 4.3. Um link com `localhost` só abre no próprio computador; para outro aparelho durante os testes, use o endereço de rede do servidor conforme o README.

## Consulta pública sem login

1. Abra `/#/groups` em janela anônima ou outro navegador sem login. Resultado esperado: lista de grupos públicos com nome e fuso; nenhuma conta, senha ou banco local do aplicativo é necessário.
2. Escolha seu grupo. Resultado esperado: temporada atual no fuso do grupo, totais de partidas/participantes/pontos jogados, tabela individual e lista de partidas já confirmadas no servidor. Os jogos enviados nas etapas anteriores devem aparecer mesmo com zero pendências no aparelho.
3. Compare a tabela com seus registros: Points exclui erro adversário; Matches inclui quem esteve escalado em um set com pontuação, mesmo com zero pontos; Days conta um dia por grupo; Wins depende do vencedor em sets e não é atribuída a quem jogou nos dois times. Empate não concede vitória.
4. Troque **Season**. Resultado esperado: totais e partidas somente do ano escolhido, considerando o início da partida no fuso do grupo. Jogos antigos sem início usam a data de fechamento, indicada na página. Uma temporada sem jogos informa **No confirmed matches in this season**.
5. Use **View match**. Resultado esperado: resultado em sets, vencedor/empate e detalhes expansíveis de cada set. Confira placares, seis participantes por time, pontos individuais e erros adversários separados. Nomes e escalações históricos acompanham o set registrado, mesmo após trocas de jogadores.
6. Copie a URL do detalhe e abra em outra janela anônima; recarregue. Resultado esperado: a mesma partida abre diretamente, sem login. Use **Back to season**: filtro e página anteriores são preservados. Com mais de 25 jogos, **Next/Previous** muda a lista sem alterar os totais da temporada.
7. No celular, confira a lista e detalhes; deslize a tabela individual horizontalmente. Resultado esperado: o restante da página não excede a largura da tela. No computador, o conteúdo ocupa uma coluna central com tabela e detalhes legíveis.

**Points played** conta todos os pontos do placar, inclusive erros adversários. A tabela individual soma somente os pontos atribuídos às pessoas. Jogadores cadastrados sem participação podem aparecer com zeros.

## Aplicativo sem History e sem tabela de temporada

1. Volte por **Open scoreboard**. Resultado esperado: somente abas **Game** e **Statistics**; History e a tabela de temporada não aparecem no aplicativo. Placar, estatísticas e Undo da partida atual continuam funcionando.
2. Abra **Players & sync → Pending uploads**. Resultado esperado: contagem de pendências, grupo, data e estado/erro de envio por arquivo. Não há consulta de resultados antigos nem tabela de temporada nesse painel. **Sync pending matches** e **Refresh pending matches** continuam disponíveis.
3. Sem internet, jogue, encerre o set e feche uma partida. Resultado esperado: arquivo pendente no painel e ausente da página pública. Reconectar ou consultar as páginas não envia a fila automaticamente.
4. Reconecte, entre como administrador se necessário e aperte **Sync pending matches**. Resultado esperado: confirmadas saem das pendências. Na página pública, use **Refresh results** e confira a inclusão do jogo nos resultados e estatísticas.
5. Caso existam arquivos antigos sem grupo, use **Associate players** no painel de pendências, revise as 12 posições e salve. Resultado esperado: associação explícita preservando pontos e nomes históricos; depois pode enviar pelo botão. Arquivos do Development group continuam usando a ligação explícita de cadastro em Players & sync.
6. Se algum arquivo falhar, confira sua mensagem e tente novamente após corrigir a causa. Resultado esperado: somente arquivos confirmados são removidos; partida atual, participantes e demais pendências permanecem. As garantias de envio da 3.4 continuam válidas.

Navegar do placar para a página pública no mesmo projeto permite que um envio já solicitado termine antes de fechar a conexão local. Fechar/recarregar a aba ou suspender o aplicativo continua sujeito à recuperação de envio interrompido da 3.4; não há serviço de envio em segundo plano do sistema.

## Falhas e separação de acesso

1. Na página pública, desconecte a rede e use **Refresh results**. Resultado esperado: erro visível com Retry; resultados anteriores, se já carregados, são identificados como a última resposta recebida, sem substituir falha por zeros. Reconecte e tente novamente.
2. Abra um grupo/partida inexistente ou uma URL inválida. Resultado esperado: mensagem de erro ou **Page not found**, com caminho para voltar à lista. Uma partida de outro grupo não abre como se pertencesse ao grupo da URL.
3. Mesmo com uma conta conectada no app, a consulta pública usa um cliente anônimo separado, sem persistência de sessão e sem renovar tokens de conta. O público recebe apenas nomes, resultados e dados do jogo; autorias de envio, administradores, e-mails de acesso e revisões privadas não aparecem.

As RPCs públicas são somente leitura e executam com permissões do visitante, respeitando RLS. Elas calculam resultados e estatísticas pelos registros confirmados; não dependem de arquivos locais nem de contadores acumulados. Nenhuma conta ganha permissão de edição por visitar a página.

## Verificações da implementação

- Testes em PostgreSQL embarcado executam as quatro migrações e comparam os totais públicos às regras locais já aprovadas: participação sem pontos, frequência por dia, empate, pessoas nos dois times, substituto sem atuação, virada do ano em Toronto e data de fechamento como fallback. Também verificam paginação com 26 partidas, isolamento por grupo, detalhes por set, leitura anônima, dados privados inacessíveis e bloqueio de escrita.
- Testes do contrato das consultas e das URLs verificam paginação de grupos, filtros, respostas divergentes e falhas de rede.
- Build web.
- Chrome com SDK Supabase real e API simulada: consulta sem login mesmo com IndexedDB bloqueado, sessão administrativa excluída das requisições públicas, temporadas, paginação, detalhes, links diretos, erros/retry, layout móvel, History removida, fila preservada no novo painel, falha parcial e associação de arquivo antigo.

O SQL novo precisa ser aplicado no seu projeto; o teste hospedado e Android/iOS físicos aguardam sua validação. Não houve publicação, merge na master, nem implementação das correções administrativas (4.2). A implementação pausa na 4.1 para sua aprovação.
