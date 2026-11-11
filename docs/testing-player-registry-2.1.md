# Aprovação da subfase 2.1 — cadastro local e identidade dos jogadores

Branch: `feat/groups-player-rosters`, criada sobre a fase 1 aprovada.

## Preparação e atualização

1. Execute `pnpm install --frozen-lockfile`, `pnpm test` e `pnpm run dev`.
2. Use o mesmo navegador, endereço e porta das versões anteriores. Não limpe dados nem desinstale o app.
3. Feche outras abas do app se a atualização do banco pedir. O banco sobe para versão 2 mantendo a partida atual e todo o histórico.
4. Confira nomes, lados, placares e **History**. Nenhuma pessoa deve ter sido cadastrada ou vinculada automaticamente.
5. Para testar sem alterar dados reais, use outro perfil do navegador. A associação confirmada de uma partida antiga ainda não pode ser corrigida nesta subfase.

## Cadastro offline e nomes comuns

1. Em **Game**, abra **Teams & players**. Deve aparecer **Development group · Local only**, com a quantidade de jogadores cadastrados.
2. Com a página carregada, fique offline (DevTools → Network → Offline ou modo avião no app nativo).
3. Informe `João` em **New player name** e toque em **Register player**. O contador deve aumentar em um.
4. Tente cadastrar ` joao `. Deve aparecer um aviso de duplicidade, com opção de usar o cadastro existente ou informar sobrenome; o contador não deve aumentar.
5. Cadastre `João Silva`: deve ser aceito como outra pessoa, com outro UUID. Não cadastre esse sobrenome se sua intenção for selecionar o João já existente.
6. Cadastre pessoas suficientes para preencher as 12 posições. Os nomes ficam disponíveis nos seletores mesmo sem internet.
7. Toque em **Cancel** e reabra **Teams & players**. Os jogadores cadastrados devem continuar presentes; a escalação ainda não deve ter sido alterada.

## Selecionar e associar o elenco

1. Selecione o jogador cadastrado correspondente a cada posição. **Previously** mostra o nome anterior para ajudar na conferência. Se houver pontos antigos, eles serão vinculados à pessoa escolhida naquela posição.
2. Escolha a mesma pessoa em duas posições e toque em **Save**: deve aparecer uma mensagem de erro, sem aplicar alterações parciais à partida.
3. Corrija e selecione 12 pessoas diferentes. Confirme **Save**. Os nomes selecionados devem aparecer no placar, mantendo pontos, sets e lados.
4. Marque um ponto e use **Undo**. O comportamento deve permanecer correto.
5. Abra **Teams & players** depois de pontuar: os seletores de pessoas devem estar bloqueados. Os nomes dos times continuam editáveis. Trocas entre sets serão entregues na 2.2.
6. Feche o set e a partida. Na nova partida, os nomes e UUIDs devem permanecer; antes do primeiro ponto, você pode reorganizar as pessoas nas posições.
7. Saia do modo offline antes de recarregar a versão web do Vite. Recarregue e confira o cadastro e a escalação. No app nativo, a reabertura deve funcionar ainda offline.

## Associar partida antiga no histórico

1. Use uma partida da fase 1 que você saiba identificar. Anote placares, participantes, pontos e data de fechamento.
2. Abra **History** → **Associate players**. Cadastros existentes devem estar disponíveis, inclusive offline.
3. Escolha explicitamente as 12 pessoas que jogaram naquela partida. Os campos de nome dos times devem estar bloqueados.
4. Use **Cancel** uma vez: a partida deve continuar sem associação e o jogo atual não deve mudar.
5. Reabra, confira todas as posições e confirme **Associate players**.
6. Deve aparecer **Players associated with a group**. Abra **View details**: nomes originais, pontos e sets devem permanecer iguais; o contador de partidas e pendências não deve mudar.
7. Volte a **Game**: a partida atual deve permanecer intacta. Recarregue e confirme que a associação foi mantida.

## Inspeção opcional do banco

No Chrome, abra DevTools → Application → IndexedDB → `volleyball-scoreboard` e atualize a visualização:

- `groups` contém o grupo local de desenvolvimento.
- `players` contém um registro por pessoa, com `id` UUID, `groupId`, `name`, `normalizedName` e `syncStatus: 'pending'`.
- Uma partida associada tem `state.groupId` e `personId` em cada jogador real. Os IDs antigos `p1` a `p6` continuam representando posições para preservar o histórico e Undo.
- Pontos associados têm `personId`; erro adversário não representa uma pessoa.
- Trocar uma pessoa de posição antes de iniciar a próxima partida preserva seu UUID. A partida encerrada anterior deve manter a escalação original.

## Falha de gravação (opcional, apenas em perfil de teste)

1. Abra **Teams & players**, cadastre os jogadores e selecione as 12 pessoas sem confirmar **Save**.
2. No Console, execute:

   ```js
   const originalTransaction = IDBDatabase.prototype.transaction;
   let failNextAssociation = true;
   IDBDatabase.prototype.transaction = function (...args) {
     const tx = originalTransaction.apply(this, args);
     if (failNextAssociation && Array.isArray(args[0]) && args[0].includes('players')) {
       failNextAssociation = false;
       queueMicrotask(() => tx.abort());
     }
     return tx;
   };
   ```

3. Toque em **Save**: deve aparecer erro, sem aplicar o elenco parcialmente. **Cancel** deve manter a partida anterior.
4. Reabra o diálogo, selecione as pessoas e tente salvar novamente. Deve funcionar; os cadastros anteriores não devem ter sido apagados.
5. Recarregue para remover a simulação.

## Android e iOS

Execute `pnpm run android:sync` ou `pnpm run ios:sync` e compile mantendo a instalação existente. Repita o cadastro offline, seleção, pontuação/Undo, associação de uma partida antiga e reabertura do app. Confira também os seletores em retrato e paisagem.

## Aprovação

Esta entrega usa um grupo local de desenvolvimento. Não há contas, sincronização remota, trocas durante uma partida nem estatísticas de temporada ainda. Informe aparelho/navegador e resultados para aprovar a 2.1 antes de começar a 2.2.
