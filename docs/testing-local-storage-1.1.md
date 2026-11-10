# Aprovação da subfase 1.1 — IndexedDB e migração

Branch: `feat/local-match-history`.

## Preparação

1. Execute `pnpm install --frozen-lockfile`, `pnpm test` e `pnpm run dev`.
2. Abra o endereço informado pelo Vite. Para migrar dados que já existem, use o mesmo navegador, endereço e porta da versão anterior. `localhost` e `127.0.0.1` têm armazenamentos diferentes.
3. Não limpe os dados do site nem desinstale o aplicativo. Se possível, anote ou capture o placar, os nomes, os lados e as estatísticas antes de atualizar.

## Partida existente e migração

1. Abra a versão atualizada onde a partida já estava salva. Após a mensagem de carregamento, devem aparecer os mesmos nomes, lados, pontos e sets.
2. Abra **Statistics** e confira os totais e o histórico dos sets.
3. Toque em **Undo**. O último ponto ou fechamento de set deve ser desfeito como antes da atualização.
4. Faça novos pontos e aguarde **Saved on this device** no rodapé.
5. Recarregue a página. Os novos pontos devem permanecer; o estado antigo não deve ser reimportado.
6. Feche a aba e abra novamente no mesmo endereço. Confira a partida e teste **Undo** mais uma vez.

## Novo armazenamento

1. Em um perfil separado do navegador, abra o app pela primeira vez. Deve aparecer a partida inicial, sem aviso de erro.
2. Edite nomes, marque pontos nos dois times e use **Switch sides**.
3. Feche um set com **Close set**, marque pontos no set seguinte e aguarde a confirmação de salvamento.
4. Recarregue. Nomes, lados, placar e estatísticas devem permanecer.
5. Use **Undo** até reabrir o set anterior. O placar anterior e os lados devem ser restaurados.

## Inspeção opcional no Chrome

1. Abra DevTools → Application → IndexedDB → `volleyball-scoreboard` e atualize a visualização.
2. Verifique os armazenamentos `activeMatches` e `closedMatches`. O primeiro deve conter a chave `current`, com `formatVersion: 1`; o segundo deve estar vazio nesta subfase.
3. Se houve migração, em Local Storage confira que a chave `volleyball-scoreboard:v1` continua presente. Ela é uma cópia antiga e não acompanha os novos pontos.

## Falha de leitura, sem mexer na partida real

Faça este teste somente em outro perfil, que não contenha sua partida.

1. Abra o app no perfil separado usado no teste de novo armazenamento.
2. Com o app aberto nesse perfil de teste, no Console execute:

   ```js
   const request = indexedDB.open('volleyball-scoreboard', 1);
   request.onsuccess = () => {
     const db = request.result;
     const tx = db.transaction('activeMatches', 'readwrite');
     tx.objectStore('activeMatches').put({ formatVersion: 999 }, 'current');
     tx.oncomplete = () => { db.close(); location.reload(); };
   };
   ```

3. Deve aparecer um aviso de falha de leitura com **Retry**, sem liberar um placar vazio. O registro inválido deve continuar no banco para recuperação.
4. Encerre o perfil de teste. Não use esse procedimento no perfil com a partida real.

## Android e iOS

1. Atualize o aplicativo mantendo a instalação e o identificador existentes: `pnpm run android:sync` ou `pnpm run ios:sync`, depois compile/execute pela ferramenta nativa.
2. Repita os testes de pontuação, edição, troca de lados, fechamento de set e Undo.
3. Aguarde **Saved on this device**, encerre o app e abra novamente, inclusive em modo avião. A partida deve permanecer disponível.

## Limites desta entrega

- Não há botão de fechar partida, histórico navegável ou envio remoto ainda.
- Falhas transacionais e tentativas posteriores de gravação também são verificadas nos testes automatizados.
- Limpar os dados ou desinstalar o app pode apagar os dados locais.
- Informe o navegador/aparelho usado e o resultado dos testes para aprovar ou solicitar ajustes antes da subfase 1.2.
