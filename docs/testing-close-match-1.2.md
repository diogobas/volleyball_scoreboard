# Aprovação da subfase 1.2 — fechar partida

Branch: `feat/local-match-history`.

## Preparação

1. Execute `pnpm install --frozen-lockfile`, `pnpm test` e `pnpm run dev`.
2. Abra no mesmo navegador, endereço e porta utilizados na subfase 1.1 para manter a partida existente.
3. Para testes que não devem alterar sua partida real, use outro perfil do navegador. Não limpe os dados da sua instalação.

## Bloqueios e resumo

1. Em uma partida vazia, confira que **Close match** está desabilitado.
2. Marque pontos: o botão deve continuar desabilitado, com a orientação **Close the current set before closing the match**.
3. Use **Close set** e confirme. Aguarde **Saved on this device**: **Close match** deve ficar disponível.
4. Marque um ponto no próximo set: **Close match** deve voltar a ficar desabilitado. Feche esse set também.
5. Toque em **Close match**. Confira o resultado em sets, vencedor (ou **Result: Draw**), os placares dos sets, todos os jogadores e seus pontos; erros adversários devem aparecer separados dos jogadores.
6. Toque em **Cancel**. Nada deve ser zerado ou arquivado. O Undo e as estatísticas devem continuar disponíveis como antes.

## Fechamento e próxima partida

1. Anote os nomes e a posição dos times na tela.
2. Abra **Close match** novamente e confirme **Save and start new match**.
3. Aguarde a mensagem de sucesso. Deve começar o **Set 1**, com placares, sets vencidos, pontos individuais e histórico zerados; nomes e lados devem permanecer iguais.
4. O botão **Undo** deve estar desabilitado: o fechamento da partida não pode ser desfeito por ele.
5. Recarregue e depois feche e reabra a aba. A nova partida deve permanecer salva.

## Conferir a partida arquivada (Chrome)

A tela de histórico só será entregue na subfase 1.3. Nesta entrega, confira o armazenamento diretamente:

1. Abra DevTools → Application → IndexedDB → `volleyball-scoreboard` → `closedMatches`. Atualize a visualização.
2. Deve haver um novo registro com UUID, `formatVersion: 1`, `closedAt`, `syncStatus: 'pending'` e `state`.
3. Expanda `state`: confira nomes, sets vencidos, pontos individuais e o histórico em `log` da partida encerrada.
4. Marque pontos e edite nomes na nova partida. Atualize a visualização do banco: o registro encerrado deve permanecer igual.
5. Feche uma segunda partida. Deve aparecer outro registro, sem substituir o primeiro.

## Funcionamento offline

1. Carregue o app e prepare uma partida com um set encerrado.
2. No navegador, ative DevTools → Network → Offline, mantendo a página aberta; no app nativo, use modo avião.
3. Feche a partida. O salvamento deve funcionar e começar a próxima partida sem depender de internet.
4. Desative o modo offline para recarregar a versão web servida pelo Vite. No aplicativo nativo, pode reabrir ainda sem internet.
5. Confira que a nova partida e o registro em `closedMatches` permaneceram. Não deve haver tentativa de envio remoto nesta subfase.

## Falha e nova tentativa (opcional, perfil de teste)

1. Prepare uma partida com set encerrado e abra o resumo de **Close match**.
2. No Console, execute o código abaixo. Ele força somente a próxima transação de fechamento a falhar:

   ```js
   const originalTransaction = IDBDatabase.prototype.transaction;
   let failNextClosure = true;
   IDBDatabase.prototype.transaction = function (...args) {
     const tx = originalTransaction.apply(this, args);
     if (failNextClosure && Array.isArray(args[0]) && args[0].includes('closedMatches')) {
       failNextClosure = false;
       queueMicrotask(() => tx.abort());
     }
     return tx;
   };
   ```

3. Confirme **Save and start new match**. Deve aparecer erro na confirmação; os pontos não devem ser zerados e nenhum novo arquivo deve aparecer em `closedMatches`.
4. Confirme novamente, sem repetir o código. Agora o fechamento deve funcionar, criando exatamente um registro.
5. Recarregue a página para remover a simulação. Não execute esse procedimento na instalação com sua partida real.

## Android e iOS

1. Execute `pnpm run android:sync` ou `pnpm run ios:sync` e compile/instale mantendo o identificador e a instalação existentes.
2. Repita cancelamento, fechamento e conferência dos nomes/lados; feche também uma partida em modo avião.
3. Aguarde a confirmação, encerre e reabra o aplicativo. A nova partida deve continuar salva.

## Critério de aprovação

O fechamento deve preservar a partida completa no banco e começar a próxima somente após salvar com sucesso. Informe o aparelho/navegador usado e qualquer diferença encontrada. A subfase 1.3 só começa depois de sua aprovação.
