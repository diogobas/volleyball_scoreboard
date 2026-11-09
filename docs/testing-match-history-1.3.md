# Aprovação da subfase 1.3 — histórico e pendências

Branch: `feat/local-match-history`.

## Preparação

1. Execute `npm ci`, `npm test` e `npm run dev`.
2. Abra no mesmo navegador, endereço e porta das subfases anteriores para consultar as partidas já salvas.
3. Não limpe os dados nem desinstale o aplicativo. Para testar a lista vazia ou simular falhas, use outro perfil do navegador.

## Lista e detalhes

1. Abra a nova aba **History**. Partidas fechadas na subfase 1.2 devem aparecer automaticamente, sem nova migração.
2. Confira o total **saved** e **awaiting upload**. Cada partida deve ter o selo **Awaiting upload**, e a tela deve informar que o envio remoto ainda não está disponível.
3. Confira que as partidas mais recentes aparecem primeiro, com resultado em sets e data/hora de fechamento no fuso do aparelho.
4. Use **View details**. Confira vencedor ou empate, placares dos sets e os nomes/pontos dos jogadores. Quem não pontuou deve aparecer com zero; erros adversários aparecem em sua própria linha.
5. Feche com **Done** e abra os detalhes de outra partida. Os dados devem corresponder à partida selecionada.
6. Volte para **Game**: a partida em andamento deve continuar com os mesmos pontos, nomes e lados.

## Atualização e persistência

1. Em **Game**, marque alguns pontos, use **Close set** e confirme. Depois use **Close match** e confirme o fechamento da partida.
2. Abra **History**: deve haver uma partida a mais no início da lista, e ambos os contadores devem aumentar em um.
3. Na nova partida em andamento, marque outros pontos ou edite nomes. Abra os detalhes da partida anterior: seus dados devem continuar iguais.
4. Recarregue e depois feche/reabra a aba no mesmo endereço. Abra **History**: partidas, detalhes e contadores devem continuar disponíveis.
5. Em outro perfil sem dados, abra **History**: deve mostrar **0 saved · 0 awaiting upload** e orientar a usar **Close match**. Uma partida ainda em andamento não entra na lista.

## Sem internet

1. Com o app carregado, ative DevTools → Network → Offline ou modo avião no aplicativo nativo.
2. Salve duas partidas usando **Close set** e **Close match**.
3. Abra **History** e confira as duas novas partidas e seus detalhes. Nenhuma consulta deve exigir internet.
4. No aplicativo nativo, encerre e reabra ainda offline. As partidas devem permanecer no histórico. Na versão servida pelo Vite, reative a conexão antes de recarregar a página.

## Falha de leitura e recuperação (opcional)

Use um perfil de teste com partidas salvas, na aba **Game**. No Console, execute:

```js
const originalTransaction = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (...args) {
  const tx = originalTransaction.apply(this, args);
  if (args[0] === 'closedMatches' && args[1] === 'readonly') {
    queueMicrotask(() => tx.abort());
  }
  return tx;
};
```

1. Abra **History**. Deve aparecer uma mensagem de falha e o botão **Retry**, sem mostrar uma lista vazia como se os registros tivessem sumido.
2. No Console, execute `IDBDatabase.prototype.transaction = originalTransaction;`. Toque em **Retry**: a lista e os contadores devem voltar ao normal.
3. Volte a **Game** e confira que a partida atual não mudou. Recarregue a página para remover a simulação.

## Android e iOS

1. Execute `npm run android:sync` ou `npm run ios:sync` e compile/instale mantendo a instalação e o identificador existentes.
2. Repita a consulta de partidas antigas, o fechamento de duas partidas offline, a abertura de detalhes e a reabertura do aplicativo.
3. Confira o uso em retrato e paisagem, com nomes longos, sem cortes que impeçam consultar os dados.

## Limites e aprovação

O histórico é local e somente de consulta. Não há envio remoto, exclusão nem edição das partidas nesta subfase. A leitura não apaga registros inválidos; eles são sinalizados sem impedir a consulta dos demais.

Informe o aparelho/navegador e os resultados para aprovar a subfase 1.3. A fase 2 só começa após sua aprovação.
