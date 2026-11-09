# Validação da versão móvel 1.2.0 (5)

O roteiro acompanha o novo TestFlight e o AAB Android para teste interno. Os testes físicos abaixo devem ser feitos após instalar o build 5; os builds e a validação de assinatura não substituem essa conferência.

1. Atualize pelo TestFlight ou Google Play preservando os dados existentes. Confira versão 1.2.0 (5), partida atual e partidas salvas.
2. Abra o app: o placar é a tela inicial. Carregue uma escalação usando o código de cinco caracteres fornecido pelo administrador de um grupo de teste.
3. Fique offline, marque pontos de jogadores e erros adversários, use Undo e feche os sets. A primeira equipe com três vitórias continua vencedora mesmo após sets extras de treino.
4. Salve uma partida, encerre e reabra o app offline. Confira os placares e pontos preservados em Saved matches.
5. Cancele a exclusão de uma partida e confira que ela permanece. Confirme a exclusão de outra partida de teste descartável e reinicie para verificar que não voltou.
6. Com internet, vincule uma partida salva a um dia de teste e sincronize manualmente. Ela aparece diretamente como finalizada no site, sem revisão pendente; repetir a tentativa não duplica o resultado.
7. Faça outra partida online e use Save & sync. Confira no site os sets, os pontos e o vencedor. Atualize o site em outro aparelho.
8. Na administração web, confira Players, Matches, Game days e Access. Em uma partida histórica de teste, escolha jogadores pelos dropdowns e crie um Sub pelo item Add player; os dados já preenchidos devem permanecer.
9. Confira Win rate e Attendance na temporada: vitória dividida por partidas jogadas e dias presentes divididos pelos dias com jogadores registrados. Várias partidas na mesma data representam uma presença.
10. Troque jogadores de time apenas em sets de treino. Os pontos continuam entrando nas estatísticas; a vitória conquistada antes da troca é preservada.

Use dados de teste e registre aparelho, versão do sistema e o passo de qualquer divergência. A instalação/execução no aparelho e a liberação dos grupos de testadores ainda precisam dessa validação.

Publicação: [TestFlight e Google Play](publishing-4.3.md).
