# Aprovação da subfase 4.2 — correções administrativas

Branch: `feat/public-stats-admin`. As correções ficam na página web, dentro do detalhe de uma partida confirmada. O aplicativo continua sem History e sem tabela de temporada; a fila de pendências permanece em Players & sync.

## Preparação

1. No projeto Supabase existente, abra **SQL Editor → New query** e execute todo o arquivo [20261106000500_administrative_corrections.sql](../supabase/migrations/20261106000500_administrative_corrections.sql). Resultado esperado: sucesso sem linhas retornadas. As quatro migrações anteriores precisam estar aplicadas. Não as execute novamente.
2. Na branch indicada, execute `npm ci` e `npm run dev`, mantendo o `.env.local` já configurado. Abra a página pública em `/#/groups`, escolha seu grupo e use **View match** em uma partida de teste.
3. Use uma conta já cadastrada e autorizada como administradora desse grupo. A página tem seu próprio login administrativo, usando as mesmas contas e permissões do Supabase; entrar/sair dessas ferramentas não encerra a conta do placar. A consulta pública continua anônima e não recebe a sessão administrativa.

Não há configuração de credenciais administrativas no código, publicação ou novo banco local nesta entrega. O SQL preserva a assinatura de envio usada pelas versões anteriores do aplicativo, compartilhando a validação do conteúdo com as correções.

## Login, participantes e autoria dos pontos

1. No detalhe da partida, use **Administrator tools**. Sem login, devem aparecer os campos de e-mail/senha. Entre como administrador. Resultado esperado: **Correct match · Version N**, com as escalações e pontos atuais. Uma conta sem permissão recebe erro e não recebe o formulário editável.
2. Expanda um set. Troque um participante por outro jogador cadastrado no mesmo grupo. Resultado esperado: os pontos daquela pessoa, naquele time e set, passam à pessoa selecionada. As demais escalações e pontos permanecem. Confira isso na lista **Points** antes de continuar.
3. Troque o **Scorer** de um ponto para outra pessoa do mesmo time ou **Opponent’s error**. Resultado esperado: a autoria muda, sem inventar outro participante. Se trocar o **Team** de um ponto atribuído a uma pessoa, escolha o autor no novo time: o campo fica sem seleção até essa revisão.
4. Use **Add point to set N** e escolha time e autor/erro adversário. Use a lixeira de um ponto para removê-lo. Resultado esperado: os placares do set são recalculados pela lista de pontos. Não é possível revisar/salvar com autoria faltando ou a mesma pessoa ocupando duas posições do set.
5. Para trocar pessoas entre os times, ajuste as duas posições e revise os pontos. Durante a troca pode haver um estado temporário inválido; o salvamento fica bloqueado até existirem 12 pessoas diferentes, seis em cada time.

Os nomes exibidos nas opções vêm do cadastro do grupo. Participantes não alterados mantêm o nome histórico registrado. Nesta versão, grupo, datas e nomes gerais dos times da partida permanecem fixos; a edição trata participantes, autoria, pontos e fechamentos de set.

## Corrigir fechamentos de set

1. Em **Set boundary**, informe a quantidade de pontos após a qual o set deveria terminar. **Split set N** divide o set nessa posição, copiando sua escalação para o novo set. Resultado esperado: nenhum ponto é perdido ou reordenado, e os dois placares são recalculados.
2. Se houver outro set depois, **Move boundary after set N** redistribui a sequência dos dois sets nessa posição. Resultado esperado: a ordem total dos pontos é mantida. Revise as duas escalações: um ponto movido precisa ter autor pertencente ao time correto do set de destino.
3. **Merge set N with next** junta dois sets consecutivos quando ambos têm os mesmos participantes em cada time. Resultado esperado: os pontos são concatenados e o fechamento intermediário é removido. Escalações incompatíveis geram uma mensagem para revisão, sem alterar os pontos.
4. Um set que ficou vazio pode ser removido por **Remove empty set N**, desde que reste pelo menos outro set. Resultado esperado: não há exclusão de pontos por essa ação; uma partida nunca pode ser salva sem nenhum set com pontuação. Não existe ação para excluir a partida.

Os sets continuam permitindo fechamentos manuais e empates. O servidor deriva o vencedor pelos sets vencidos, e o resumo público recalcula pontos, participações, vitórias e dias pelos registros corrigidos.

## Motivo, revisão e confirmação

1. Deixe **Reason for correction** vazio. Resultado esperado: **Review correction** fica indisponível. Preencha um motivo de até 500 caracteres e resolva os avisos de escalação/autoria.
2. Use **Review correction**. Resultado esperado: comparação **Before/After**, com placares, participantes e pontos de cada set. Expanda os sets para revisar. **Keep editing** volta ao rascunho sem salvar.
3. Use **Save correction**. Resultado esperado: confirmação online e incremento da versão em uma unidade. A página pública é atualizada, e o formulário carrega a versão atual. O motivo é limpo para uma eventual próxima correção.
4. Feche as ferramentas e confira resultado, detalhes por set e tabela individual da temporada. Resultado esperado: os dados refletem os registros corrigidos, inclusive participação sem pontos e ausência de vitória para quem atuou nos dois times.
5. Abra **Administrator tools → Private revision history**. Resultado esperado: versão, autor, data, motivo e comparação completa dos valores anteriores/novos. O histórico é paginado a cada 20 revisões e só pode ser lido por administradores do grupo.
6. Na janela anônima, abra a mesma partida sem usar o login administrativo. Resultado esperado: resultados corrigidos visíveis, sem motivo, autor, e-mail administrativo ou conteúdo privado da revisão.

Para desfazer uma correção de teste, faça outra correção restaurando os valores desejados e informe o motivo. A revisão anterior permanece registrada.

## Duas sessões e falhas

1. Abra a mesma partida em duas abas e entre como administrador em ambas. Carregue as ferramentas nas duas antes de salvar qualquer alteração.
2. Faça uma correção na primeira aba e salve. Na segunda, faça outra alteração e tente salvar a versão que já estava carregada. Resultado esperado: mensagem **This match has changed**, sem sobrescrever a primeira alteração. O rascunho e o motivo da segunda aba permanecem, e o salvamento fica bloqueado.
3. Na segunda aba, use **Load latest version**, confirme **Load latest** e revise novamente. Resultado esperado: a versão atual substitui o rascunho somente após ser carregada com sucesso. **Keep draft** cancela essa substituição.
4. Desconecte a internet com as ferramentas abertas. Resultado esperado: aviso e salvamento indisponível; o rascunho fica em memória enquanto essas ferramentas permanecerem abertas. Reconecte para continuar. O rascunho não é gravado offline e não sobrevive a fechar/recarregar a página.
5. Se uma resposta falhar depois do envio, mantenha o mesmo rascunho/motivo e repita **Save correction**. Resultado esperado: o identificador da tentativa é reutilizado, e uma correção já aplicada é apenas confirmada, sem duplicar a revisão. Uma tentativa sem resposta termina em cerca de 45 segundos enquanto o navegador está ativo.
6. Para testar falta de permissão, mantenha uma conta de teste com um rascunho aberto e revogue seu acesso usando outro administrador. Tente salvar pela conta revogada. Resultado esperado: erro de autorização, resultado e histórico remoto intactos, sem publicar a alteração recusada.
7. Fechar as ferramentas ou sair da conta com um rascunho pede confirmação para descartá-lo. A sessão do administrador na página é separada da sessão do aplicativo; sair dela não apaga partidas locais nem encerra a conta do placar.

Reenvios da partida original pelo aplicativo continuam recebendo confirmação da submissão inicial. Eles não sobrescrevem uma correção posterior. O servidor mantém a submissão original separada das revisões e exige versão atual em toda nova correção.

## Verificações da implementação

- Testes em PostgreSQL embarcado aplicam as cinco migrações e verificam correção transacional, histórico completo, permissões, rejeição de versão antiga, idempotência da revisão, rollback de alterações inválidas, novos totais públicos, paginação do histórico e preservação de correções diante de reenvios antigos. Os testes de envio da 3.3 também rodam contra o SQL novo.
- Testes dos controles do editor cobrem participantes, autores, erros adversários, pontos adicionados/removidos, divisão/junção/limites dos sets, ordem dos pontos e validação. O contrato das RPCs cobre sessão expirada, troca de conta, falha de confirmação, timeout e respostas divergentes.
- Build web.
- Chrome, com SDK Supabase real e API simulada: login administrativo sem IndexedDB, correção completa, revisão antes de salvar, confirmação perdida/repetida, atualização pública, histórico privado, concorrência em duas abas, rascunho offline, usuário sem permissão e layout móvel. A consulta pública e a fila de pendências da 4.1 também continuam verificadas.

O SQL novo não foi aplicado automaticamente no seu projeto. O roteiro no Supabase real e em Android/iOS físicos depende da sua validação. Nenhuma partida real foi corrigida pelos testes automatizados. Publicação e validação integrada continuam na 4.3. Não há merge na master; a implementação pausa aqui para aprovação da 4.2.
