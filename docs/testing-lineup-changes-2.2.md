# Aprovação da subfase 2.2 — trocas e substituições entre sets

Branch: `feat/groups-player-rosters`.

## Preparação

1. Execute `pnpm install --frozen-lockfile`, `pnpm test` e `pnpm run dev` e use o endereço anterior. Não limpe dados nem desinstale o aplicativo.
2. Use uma partida associada aos jogadores cadastrados na 2.1. Caso ainda não tenha cadastro, abra **Teams & players**, registre os participantes e selecione 12 pessoas diferentes. A lista vazia agora explica que é preciso cadastrar primeiro.
3. Para testes sem alterar dados reais, prefira outro perfil do navegador. Cadastre também uma 13ª pessoa para testar entrada de alguém de fora.

## Trocar entre os times

1. Escolha duas pessoas, uma de cada time (por exemplo, Ana no Time 1 e Bruno no Time 2).
2. Marque dois pontos para Ana e um para Bruno. Abra **Teams & players**: os seletores devem estar bloqueados com orientação para fechar o set. Cancele.
3. Feche o set usando **Close set**, mesmo com o placar reduzido de teste. Os lados podem trocar automaticamente, mas a identidade dos times deve permanecer a mesma.
4. Abra **Teams & players**: os seletores devem estar liberados. Coloque Bruno na posição de Ana e Ana na posição de Bruno; confira as 12 pessoas e salve.
5. O set atual deve continuar zerado. Abra o histórico recente: deve aparecer **Lineup changed**, sem ponto adicional.
6. Marque três pontos para Ana no novo time e um para Bruno no novo time. Os pontos devem aumentar nos times em que eles estão agora.
7. Em **Statistics**, Ana deve ter cinco pontos no Top 3, com uma única entrada, se estiver entre os três maiores pontuadores. Nas listas por time, deve ter dois pontos no time anterior e três no novo time. Bruno deve ter um ponto em cada time.

## Entrada de alguém de fora

1. Feche o set e anote os pontos de uma pessoa que será substituída.
2. Em **Teams & players**, selecione a 13ª pessoa no lugar dela. Se necessário, cadastre essa pessoa usando **Register player**; o cadastro funciona offline.
3. Antes de salvar, selecione uma pessoa já escalada em outra posição. **Save** deve recusar a duplicidade, sem aplicar alterações parciais. Corrija e salve.
4. O substituto deve começar o set com zero pontos e não herdar os pontos de quem saiu.
5. Marque um ponto no novo set. Em **Statistics**, a pessoa que saiu deve continuar presente com seus pontos anteriores, inclusive se tinha zero; o substituto deve ter somente seus próprios pontos.
6. Alguém apenas selecionado entre sets, sem nenhum ponto jogado naquele set, ainda não deve contar como participante dos sets anteriores.

## Desfazer e restaurar

1. Depois de fechar um set, salve uma alteração de escalação sem pontuar no próximo.
2. Toque em **Undo**: deve restaurar a escalação anterior, mantendo o set atual zerado.
3. Toque em **Undo** novamente: deve reabrir o set anterior com seus jogadores, placares e lados anteriores.
4. Feche o set, refaça a alteração e marque um ponto. O primeiro Undo deve retirar esse ponto; o segundo deve desfazer a escalação; o terceiro deve reabrir o set anterior.
5. Salve duas alterações seguidas antes do próximo ponto: dois Undos devem voltar pelas duas escalações na ordem inversa.
6. Use **Switch sides** entre as operações. Ele deve trocar somente a posição visual dos times, sem mover pessoas de um time para outro.

## Por set, histórico e próxima partida

1. Em **Statistics**, expanda os sets encerrados: confira os participantes de cada time e o ranking do set. As trocas posteriores não devem mudar o set antigo.
2. Feche todos os sets com pontos e use **Close match**. Confira as escalações por set, os pontos por time e a presença de quem foi substituído.
3. Confirme o fechamento. A próxima partida deve usar a última escalação, com pontos, sets e histórico zerados.
4. Abra **History → View details**. As escalações e pontos da partida encerrada devem permanecer iguais ao resumo.

## Offline e persistência

1. Carregue o aplicativo e fique offline. Feche um set, troque jogadores e marque pontos no próximo.
2. Consulte **Statistics**, incluindo o histórico de sets. Nenhuma operação deve exigir internet.
3. Recarregue a versão web após reativar a conexão com o Vite. No aplicativo nativo, pode encerrar e reabrir ainda offline.
4. Confira escalação atual, pontos individuais e autores dos pontos; teste Undo depois da reabertura.
5. Repita no Android/iOS após `pnpm run android:sync` ou `pnpm run ios:sync`, mantendo a instalação existente. Valide os seletores e resumos em retrato e paisagem.

## Resultado esperado e limites

Cada ponto deve acompanhar a pessoa que marcou e o time pelo qual ela marcou naquele momento. Trocar uma pessoa não deve transferir seus pontos para o substituto nem apagar sua participação. Set com pontos bloqueia trocas; alterações entre sets devem sobreviver à reabertura e poder ser desfeitas.

Esta subfase continua usando o grupo local de desenvolvimento. Totais de frequência, partidas, vitórias e temporadas ficam para a 2.3; envio remoto fica para a fase 3. Informe aparelho/navegador e resultados para aprovar a 2.2 antes de avançar.
