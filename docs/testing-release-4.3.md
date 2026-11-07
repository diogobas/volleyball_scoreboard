# Aprovação da subfase 4.3

Branch: `feat/public-stats-admin`. Versões nativas 1.1.0 (3).

## Verificações executadas

- 139 testes automatizados de regras, persistência, sincronização, API e permissões SQL.
- Builds web do placar e da página pública; navegação pública de produção em desktop e viewport de celular sem overflow.
- Publicações Cloudflare e GitHub Pages concluídas; navegação e recarga de detalhes verificadas no endereço público.
- Consulta real somente leitura: grupos, oito partidas de 2026, detalhes e recusa de acesso administrativo anônimo.
- Build Android debug e release AAB assinado, verificado com jarsigner.
- Archive iOS, exportação e upload App Store Connect concluídos; build de simulador compilado.
- Simuladores apresentaram falhas de sistema/gráficos; o fluxo completo em aparelhos físicos ainda precisa da aprovação abaixo. Não foram criadas partidas artificiais no banco real nem alterados dados do telefone pessoal.

## Preparação

Siga [publicação e instalação](publishing-4.3.md) para selecionar o build TestFlight e enviar o AAB ao teste interno Google Play. Use uma conta de administrador de um grupo de teste. Não altere partidas oficiais para validar correções. Se preferir, crie um grupo separado para estes testes.

## Passo a passo

1. Abra https://volleyball-scoreboard-results.pages.dev/ sem login. **Esperado:** lista de grupos; o placar não é a tela inicial do site.
2. Abra o grupo, escolha a temporada e uma partida. Recarregue e copie o link para outro navegador/celular. **Esperado:** mesmos sets, participantes, placares e totais; acesso sem conta.
3. Autentique um administrador e abra as ferramentas de uma partida de teste. Confira a lista Points. **Esperado:** mais espaço entre o título de cada ponto, campos Team/Scorer e a linha seguinte, inclusive no celular.
4. Corrija um ponto com motivo, salve e consulte sem login no outro aparelho. **Esperado:** placar/estatísticas recalculados; motivo e autoria administrativa continuam privados. Cancele um rascunho e confirme que nada foi salvo.
5. Instale/atualize o iOS pelo TestFlight e Android pelo link de teste interno. **Esperado:** ambos abrem o placar, sem aba History; ações de jogo e Statistics continuam disponíveis.
6. Online, entre na conta, abra Players & sync, selecione o grupo de teste e atualize jogadores. **Esperado:** cadastro fica disponível no aparelho.
7. Ative modo avião, escale os times, marque pontos (inclusive erro adversário), teste Undo, encerre o set e use Close match. **Esperado:** nova partida começa com escalação/lados preservados e uma pendência aparece em Players & sync → Pending uploads.
8. Feche completamente e reabra o aplicativo, ainda offline. **Esperado:** partida atual e pendência persistem; jogadores podem ser selecionados sem internet.
9. Recupere a internet. **Esperado:** pendência antiga permanece até ação manual. Toque Sync pending matches. **Esperado:** somente após confirmação ela é removida do aparelho e fica acessível no site do outro dispositivo.
10. Jogue e encerre outra partida online. **Esperado:** envio automático; resultado público atualizado, sem duplicação ao atualizar páginas.
11. Volte a ficar offline, crie outra pendência e tente enviar. **Esperado:** erro claro sem perda; após recuperar conexão, tentativa manual conclui normalmente.
12. Confira temporada, frequência (um dia mesmo com várias partidas), participantes sem pontos e pessoa que atuou nos dois times (sem vitória individual). **Esperado:** regras do plano preservadas. Corrija e compare novamente caso necessário, somente no grupo de teste.

Registre aparelho/versão do sistema e qualquer passo divergente. A validação física e a liberação dos grupos de testadores permanecem pendentes até estes passos; não é necessário fazer merge na master para aprovar.
