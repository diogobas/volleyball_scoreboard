# Aprovação da subfase 2.3 — estatísticas individuais e temporadas

Branch: `feat/groups-player-rosters`.

## Preparação

1. Execute `npm ci`, `npm test` e `npm run dev`.
2. Use o mesmo navegador/endereço/porta das versões anteriores. Não limpe dados nem desinstale o app.
3. Abra **History**: o resumo **Season statistics** deve aparecer acima da lista, com grupo, fuso, seletor de ano e colunas **Player, Points, Matches, Wins, Days**.
4. Use um perfil separado se quiser conferir os números abaixo partindo de zero. Cadastre 12 pessoas e associe a escalação em **Teams & players**; cadastre uma 13ª pessoa para testar substituição.

## Duas partidas no mesmo dia

1. Em uma partida nova associada, marque dois pontos para Ana no Time 1 e um para Bruno no Time 2. Use **Close set**, depois **Close match**.
2. Em **History**, selecione o ano atual no fuso do grupo. A primeira partida deve contar uma partida e um dia para cada um dos 12 participantes.
3. Ana deve ter **2 points, 1 match, 1 win, 1 day**; Bruno deve ter **1 point, 1 match, 0 wins, 1 day**. Alguém do Time 1 que não pontuou deve ter **0 points, 1 match, 1 win, 1 day**.
4. A pessoa cadastrada que ainda não jogou deve aparecer com todos os valores zerados.
5. Feche outra partida no mesmo dia com os mesmos jogadores, vencida pelo Time 1, com um ponto de Ana.
6. Ana deve passar para **3 points, 2 matches, 2 wins, 1 day**. O total de dias dos demais participantes também deve continuar em um.
7. Estes valores pressupõem um perfil sem partidas anteriores. Com histórico já existente, confira os incrementos em relação aos totais anteriores.

## Trocas, substituições e empate

1. Comece uma nova partida, marque pontos e feche o primeiro set com vitória do Time 1.
2. Troque Ana e Bruno de times entre sets e pontue no segundo set. Feche-o com vitória do Time 1 e encerre a partida.
3. Ana e Bruno devem ganhar apenas uma partida e os pontos que fizeram, cada um em sua própria linha. Nenhum dos dois deve receber vitória nessa partida, pois atuaram pelos dois times.
4. Quem participou exclusivamente pelo Time 1 deve receber uma vitória, mesmo sem marcar pontos.
5. Em outra partida, substitua alguém entre sets pela 13ª pessoa. Jogue um ponto no set seguinte, feche-o e encerre a partida. Quem saiu e quem entrou devem contar uma participação; seus pontos não devem se misturar.
6. Selecionar um substituto depois do último set e fechar a partida sem jogar outro ponto não deve contar participação para essa pessoa.
7. Feche uma partida empatada em sets (ou com um único set empatado manualmente): ela deve contar pontos, partidas e dia, sem acrescentar vitória a ninguém.

## Histórico antigo e associação

1. Partidas antigas já associadas devem entrar nos totais da temporada correspondente. Se não tinham horário de início, deve aparecer a observação sobre usar a data de fechamento.
2. Partidas ainda sem associação devem gerar um aviso e ficar fora dos totais; a lista de histórico continua mostrando seus detalhes.
3. Use **Associate players** em uma partida antiga, confira as 12 pessoas e confirme. A tabela deve atualizar automaticamente para incluir seus resultados; selecione o ano correspondente se necessário.
4. A associação não deve mudar os placares, a data de fechamento nem a partida em andamento.

## Datas, ano e fuso

1. Para partidas novas, o primeiro ponto registra o início; recarregar não deve mudar essa data. Marcar pontos sem fechar a partida não deve aumentar os totais da temporada.
2. Fechar a partida depois da meia-noite usa o dia em que começou, no fuso indicado na tabela.
3. Se houver partidas de anos anteriores, troque **Season**: somente as partidas do ano escolhido devem contar. Jogadores sem partidas naquele ano continuam com zero.
4. Os cenários de virada de ano, horário de verão, duas datas diferentes e fechamento dias depois do início podem ser verificados sem alterar o relógio ou os dados reais:

   ```sh
   node --test --test-reporter=spec src/game/seasons.test.js
   ```

   Os nove testes devem passar, incluindo a diferença entre data UTC e data do grupo.
5. Opcionalmente, em DevTools → Application → IndexedDB → `volleyball-scoreboard` → `activeMatches`, confira `state.startedAt` após o primeiro ponto. Ele deve sobreviver à recarga e não existir na próxima partida vazia.

## Offline, persistência e aparelhos

1. Com o app carregado, fique offline. Feche uma partida associada e consulte **History**. Os totais devem atualizar sem internet.
2. Troque de aba e volte; os números devem permanecer iguais, sem somar a mesma partida novamente.
3. Reative a conexão para recarregar a versão web servida pelo Vite. No aplicativo nativo, encerre e reabra ainda offline. A tabela deve manter os mesmos totais.
4. Em telas estreitas, deslize a tabela horizontalmente para conferir todas as colunas; a página inteira não deve ficar mais larga que a tela.
5. Para Android/iOS, execute `npm run android:sync` ou `npm run ios:sync` e compile mantendo a instalação existente. Repita consulta, fechamento offline e reabertura.

## Critério de aprovação

Confirme os totais de pontos, partidas, vitórias e dias; a distinção entre jogador que não pontuou e jogador que não participou; o filtro por ano e a persistência após reabertura. Este resumo considera somente partidas encerradas e associadas que estão neste aparelho. Não há envio remoto ainda.

Informe aparelho/navegador e resultados para aprovar a 2.3. A fase 3 começa somente após sua aprovação.
