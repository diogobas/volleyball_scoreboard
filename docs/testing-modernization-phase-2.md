# Modernização — validação da Fase 2

Entrega na branch `feat/modernization-phase-2-app`, baseada em `feat/code-modernization`. O PR desta etapa tem a feature branch como destino. Nenhum merge ou deploy faz parte desta entrega. A Fase 3 aguarda validação explícita.

## O que revisar

- `App.tsx` compõe a inicialização da sessão e a página do placar.
- `pages/ScoreboardPage` coordena abas, diálogos e ações de interface.
- `components/atoms` contém elementos pequenos próprios do app, como PrivacyLink; `molecules` contém avisos, preparação, navegação, rodapé e confirmações; `organisms` contém placar, escalações, histórico, estatísticas e diálogos.
- Cada componente tem uma pasta, implementação `.tsx` e exportações explícitas por `index.ts`. Componentes e hooks migrados usam arrow functions.
- `useMatchSession` inicializa, recupera e encerra o banco; `useMatchController` coordena estado, salvamento e fechamento; `useSavedMatches` atualiza pendências e sincronização; `useOnlineStatus` acompanha conectividade.
- `game/types.ts` define partida, ações e eventos discriminados, times, jogadores, contexto do dia e arquivos locais. Os contratos com módulos JavaScript existentes usam JSDoc referenciando esses tipos; a conversão das implementações de domínio e acesso remoto fica para a Fase 3.
- A versão do IndexedDB, os formatos dos arquivos e os contratos Supabase permanecem iguais. Componentes MUI continuam sendo usados diretamente.

## Verificações automatizadas

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run test:hooks
pnpm test
pnpm run build
pnpm run build:public
```

`pnpm test` inclui os testes TypeScript dos hooks usando `node:test`, `tsx`, React Testing Library, jsdom e IndexedDB simulado. Os testes cobrem Strict Mode, restauração interrompida, espera por uploads no encerramento, falhas/repetição de gravação, resposta antiga sem retrocesso do placar, bloqueio de fechamentos concorrentes, importação de escalações e recuperação de pendências.

Para os testes de navegador, use uma porta livre e um servidor com configuração fictícia; todas as chamadas externas são simuladas:

```sh
VITE_SUPABASE_URL=https://volleyball-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test pnpm run dev --host 127.0.0.1 --port 5198 --strictPort
```

Em outro terminal, com Google Chrome instalado:

```sh
BASE_URL=http://127.0.0.1:5198 pnpm run test:court:browser
BASE_URL=http://127.0.0.1:5198 pnpm run test:public:browser
BASE_URL=http://127.0.0.1:5198 pnpm run test:admin:browser
BASE_URL=http://127.0.0.1:5198 pnpm run test:communities:browser
```

`playwright-core` agora é uma dependência de desenvolvimento local. Não é necessário informar `PLAYWRIGHT_MODULE` quando ela estiver instalada neste projeto. As capturas ficam em `artifacts/`, fora do Git.

## Validação manual

1. Use a mesma origem de antes para recuperar os dados existentes, sem limpar o armazenamento. Confira nomes, placar e lados.
2. Marque pontos, desfaça, alterne os lados e as abas. Confira Top 3, estatísticas e histórico de sets.
3. Edite nomes; carregue uma escalação antes do primeiro ponto; confira que ela continua disponível após recarregar offline.
4. Feche um set e salve a partida localmente. Confira a nova partida, o arquivo salvo e sua recuperação após recarregar.
5. Confira cancelamento da exclusão local e, com uma partida de teste, sincronização e nova tentativa após falha. A cópia local só deve ser removida após confirmação.
6. Abra resultados públicos e administração para conferir os consumidores dos componentes compartilhados.

Ao concluir, valide a Fase 2 ou informe ajustes. O PR deve permanecer em rascunho e a Fase 3 não começa antes da aprovação. A decisão sobre merge em `master` continua reservada à validação final de toda a modernização.

## Resultado desta entrega

- 257 testes aprovados: os 243 anteriores e 14 novos testes dos hooks, sem testes ignorados.
- Checagem de tipos e formatação aprovadas. Lint sem erros; permanecem quatro avisos nas telas JavaScript previstas para a Fase 3. O aviso do antigo App foi resolvido.
- Builds do app e do site público aprovados; permanece o aviso de bundle acima de 500 kB.
- Os quatro testes de navegador passaram: quadra, resultados públicos, administração e comunidades, com chamadas externas simuladas.
- A validação em aparelhos e os builds nativos completos permanecem na Fase 4. Não foram executados deploy, migrações ou merges.
