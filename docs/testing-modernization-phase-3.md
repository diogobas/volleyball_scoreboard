# Modernização — validação da Fase 3

Entrega em `feat/modernization-phase-3-typescript`, baseada em `feat/code-modernization`. O PR desta etapa tem a feature branch como destino e permanece em rascunho até sua revisão. Não integrar em `master` nem publicar como parte desta migração. A Fase 4 aguarda aprovação explícita.

## O que mudou

- Todo o código de `src`, incluindo testes, regras, persistência, acesso remoto e tema, usa TypeScript estrito. Não existem arquivos `.js` ou `.jsx` em `src`. `allowJs` permanece temporariamente na configuração até a consolidação.
- `main.tsx` carrega `App.tsx`, que coordena a navegação por hash. O antigo `Root.jsx` foi incorporado ao App. URLs, entradas padrão e carregamento sob demanda continuam iguais. `routes/lazyPages.ts` concentra os dois imports dinâmicos das páginas; App e serviços remotos usam imports convencionais. Clientes Supabase continuam sendo criados apenas ao chamar suas funções de acesso.
- `pages/ScoreboardPage` inicializa e encerra a sessão IndexedDB do placar. Abrir resultados ou administração não inicializa esse banco.
- `pages/PublicResultsPage` coordena comunidades, grupos, partidas e perfis públicos. `pages/AdministrationPage` coordena autenticação e o workspace. Painéis e diálogos administrativos são organisms, pois compõem essas páginas.
- Componentes possuem pasta própria, `.tsx`, props tipadas e `index.ts`. Navegação, filtros, paginação e seleção são molecules; cadastros, escalações, estatísticas e correções são organisms. Correção de partidas foi separada em `CorrectionEditor`, `SetEditor`, `SnapshotComparison` e `RevisionHistory`. Resultados compartilham `GroupSeason`, `MatchCard`, `MatchDetails` e `MatchTopScorers`.
- `useHashRoute`, `useAdminSession` e `usePublicResults` compartilham navegação, sessão administrativa e consultas públicas com repetição/descarte de respostas antigas. Os hooks do placar permanecem responsáveis por recuperação, estado, persistência e sincronização.
- `game/types.ts`, `registryTypes.ts`, `remote/models.ts`, `remote/transport.ts` e `public/routeTypes.ts` centralizam contratos. As validações dos serviços, transações, bloqueios e confirmações continuam presentes; não houve migração de dados ou mudança de RPC.
- Foram removidos os diálogos legados sem consumidores `AccountDialog`, `PlayerRegistryDialog` e `PendingUploadsDialog`. Os fluxos ativos de autenticação, jogadores e partidas salvas continuam nas páginas e componentes atuais.
- Testes de `src` continuam em `node:test`, executados com `tsx`. Testes SQL e scripts operacionais fora de `src` permanecem JavaScript; seus imports apontam para os módulos migrados. Nenhuma dependência nova foi necessária nesta fase.

## Verificações e resultados

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
pnpm run build
pnpm run build:public
```

- 262 testes aprovados, sem falhas ou testes ignorados: 257 existentes e cinco novos testes de hooks de sessão/navegação/resultados.
- Tipos, lint e formatação aprovados; os quatro avisos de hooks antes existentes foram resolvidos sem desativar regras.
- Builds do app e público aprovados. Permanece o aviso já existente de chunk acima de 500 kB. Com imports convencionais nos serviços, o código do SDK Supabase passa a compor o pacote inicial; a criação dos clientes continua sob demanda.
- Os quatro fluxos de navegador passaram no Google Chrome: quadra, resultados públicos, administração e comunidades, com todas as chamadas externas simuladas.
- Não foram executados deploys, migrações remotas ou merges. Validação nativa/Android e em aparelhos pertence à Fase 4.

Os novos testes verificam restauração/assinatura de sessão, troca de conta, limpeza após desmontagem, mensagens de falha, navegação por hash, respostas obsoletas e repetição de consultas preservando os últimos dados recebidos. A suíte existente continua cobrindo regras, IndexedDB e falhas de transações, concorrência de uploads, contratos Supabase e permissões SQL.

Para reproduzir os testes de navegador, inicie uma instância isolada com configuração fictícia:

```sh
VITE_SUPABASE_URL=https://volleyball-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test pnpm run dev --host 127.0.0.1 --port 5198 --strictPort
```

Em outro terminal, com Google Chrome instalado:

```sh
BASE_URL=http://127.0.0.1:5198 pnpm run test:public:browser
BASE_URL=http://127.0.0.1:5198 pnpm run test:admin:browser
BASE_URL=http://127.0.0.1:5198 pnpm run test:communities:browser
BASE_URL=http://127.0.0.1:5198 pnpm run test:court:browser
```

Capturas ficam em `artifacts/`, fora do Git. Esses testes usam respostas simuladas; não comprovam disponibilidade de Auth/Data API hospedados.

## Validação manual solicitada

1. Execute `pnpm run dev` e abra a origem habitual, mantendo o armazenamento existente. Confira placar, nomes, pontuação, desfazer, troca de lados e recuperação após recarregar. Abra e feche partidas salvas; repita offline com dados de teste.
2. Abra um link público de comunidade (`#/communities/C-1`) e depois um grupo (`#/groups/G-1`). Confira aparência, textos, links de retorno e URLs diretas, inclusive recarregando a página.
3. No grupo, confira Overview, Players e Matches; filtros Year/Season, paginação, estatísticas, Top scorers, detalhes de partida e perfil individual. Volte às listas e confira os filtros retidos. Simule falta de rede e use Retry.
4. Abra `#/admin`. Entre e saia da conta de teste, recarregue com sessão existente e confira acesso apenas às comunidades/grupos autorizados. Percorra My communities, My groups, os administradores e a reutilização de jogadores da comunidade.
5. Com dados de teste, confira cadastro/edição/categoria/perfil de jogador, busca e paginação. Em Matches, confira detalhes, partida histórica com/sem totais, correção com motivo, comparação e histórico de versões. Confirme que partidas finalizadas continuam protegidas contra exclusão.
6. Em Game days, confira busca/filtros, criação/edição, escalação, preservação de rascunhos e fechamento. No placar, confira download de escalação, salvamento offline, cancelamento de exclusão e sincronização de uma partida de teste.
7. Repita navegação pública e administrativa em uma janela estreita, verificando textos, tabelas, diálogos e ausência de rolagem horizontal inesperada.

Para validar o build público, execute `pnpm run build:public` e `pnpm run preview:public`; sem hash inicial deve aparecer a orientação para abrir o link compartilhado. O build normal deve abrir o placar. Não publique os builds para realizar essa revisão.

Ao concluir, valide a Fase 3 ou informe os ajustes. Pedidos de ajuste mantêm esta fase aberta. A Fase 4 e o merge deste PR na feature branch aguardam sua decisão; o PR principal para `master` permanece em rascunho até a validação final de toda a modernização.
