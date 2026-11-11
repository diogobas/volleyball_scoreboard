# Convenções do código

## Ferramentas e arquivos

Use a versão pnpm fixada em `packageManager`, mantenha `pnpm-lock.yaml` e instale com `pnpm install --frozen-lockfile`. Não crie lockfiles npm/yarn. Dependências locais são executadas com `pnpm exec`.

Todo arquivo de código em `src` usa TypeScript estrito: `.tsx` quando contém JSX, `.ts` nos demais casos. `allowJs` está desativado; o lint rejeita `.js`/`.jsx` em `src`. CSS e declarações `.d.ts` continuam permitidos. Scripts de operação e testes SQL fora de `src` podem ser JavaScript. `eslint.config.js` é configuração de ferramenta e fica fora da checagem TypeScript.

Use arrow functions em componentes, hooks, regras e callbacks. Use `import type` para tipos. Não introduza `any` explícito ou desative a checagem para contornar erros; dados desconhecidos entram como `unknown` e são validados antes de usar. Prettier define a formatação.

## Páginas e componentes

A organização segue a separação por responsabilidade adotada no Catalyst:

- `pages`: telas completas. `ScoreboardPage` coordena a sessão do placar; `PublicResultsPage` coordena resultados públicos; `AdministrationPage` coordena autenticação e o workspace.
- `components/atoms`: elementos pequenos próprios da aplicação, como o link de privacidade.
- `components/molecules`: combinações pequenas, como filtros, paginação, avisos e confirmações.
- `components/organisms`: partes completas de uma tela, como quadra, cadastro, estatísticas e editor de correções. Painéis administrativos compõem páginas; não precisam se tornar páginas independentes.

Cada componente tem uma pasta com o mesmo nome, implementação `.tsx` e `index.ts` com exportação nomeada. Defina as props junto à implementação e exporte o tipo quando outros módulos precisarem dele. Prefira nomes ligados à responsabilidade e props explícitas, sem passar serviços inteiros quando bastam dados/callbacks.

Extraia componentes quando houver responsabilidade própria, reutilização ou complexidade que prejudique a leitura. Use MUI diretamente quando suficiente; não crie wrappers ou camadas apenas para cumprir a classificação. Mantenha aparência, acessibilidade, textos e comportamento existentes ao refatorar.

`App.tsx` compõe navegação e páginas. Imports dinâmicos ficam em `routes/lazyPages.ts`, para carregar as páginas públicas/administrativas sob demanda. Os demais módulos usam imports convencionais. `remote/client.ts` cria os clientes Supabase somente quando suas funções de acesso são chamadas.

## Hooks e estado

Hooks ficam em `hooks` e recebem dependências explícitas quando isso permite testar seus efeitos sem servidor real. Extraia uma responsabilidade de estado/efeitos ou lógica reutilizável; estado simples de um formulário pode ficar no componente.

- `useHashRoute`: acompanha a URL e limpa o listener.
- `useAdminSession`: restaura e acompanha a sessão administrativa.
- `usePublicResults`: consulta, repete e ignora respostas antigas.
- `useMatchSession`: abre, restaura e encerra a sessão local.
- `useMatchController`: coordena ações, persistência e fechamento.
- `useSavedMatches`: acompanha arquivos locais e sincronização.
- `useOnlineStatus`: acompanha conectividade.

Declare todas as dependências dos efeitos e limpe listeners/assinaturas. Respostas de uma rota, identidade ou sessão encerrada não podem substituir o estado atual. Preserve transações, bloqueios e confirmações de upload. O encerramento do banco aguarda operações em andamento.

Diálogos animados mantêm o conteúdo mostrado até o fim do fechamento; cancelar não pode trocar o título/ação por outra confirmação. `MatchConfirmationDialog` preserva o conteúdo da última confirmação aberta para esse intervalo.

## Domínio, dados e contratos

`game` concentra regras e persistência local. `game/types.ts` descreve estado/ações/eventos e `registryTypes.ts` descreve o cadastro local. `public` reúne rotas e projeções para apresentação; `remote` concentra consultas e sincronização.

`remote/models.ts` descreve os dados remotos e `remote/transport.ts` relaciona endpoints aos resultados. A tipagem não substitui a validação de respostas, IDs, versões, permissões e recibos. Não altere nomes de RPCs, campos, URLs, chaves de armazenamento ou versão/estrutura do IndexedDB como consequência de uma reorganização.

Use uniões discriminadas para ações/eventos e tipos compartilhados para contratos reais. Mantenha nomes de campos do servidor e diferenças entre IDs de jogador, pessoa, grupo e partida. Reutilize os modelos em vez de duplicar versões incompatíveis.

## Verificação

Antes de enviar alterações:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
pnpm run build
pnpm run build:public
```

`pnpm run format` aplica a formatação. O CI executa os checks web em Node 22/24 e compila o Android em Java 21.

Testes de domínio/serviços usam `node:test` em `.test.ts`; hooks usam `.test.tsx`, React Testing Library e jsdom. `tsx` executa os testes sem trocar o runner. Testes SQL executam PostgreSQL embarcado e ficam em `supabase`.

Teste comportamento e falhas relevantes: restauração, persistência, desfazer, isolamento de contas, resultados obsoletos, bloqueios, confirmações e permissões. Use clientes simulados nos testes automatizados; não escreva em dados reais para validar uma refatoração.

Os comandos `test:public:browser`, `test:admin:browser`, `test:communities:browser` e `test:court:browser` aceitam `BASE_URL`. `test:build:browser` usa `APP_BASE_URL`/`PUBLIC_BASE_URL` e verifica os dois builds. Precisam de Google Chrome; artefatos ficam em `artifacts/`, fora do Git.

## Integração nativa e entrega

O Capacitor inclui `dist`, o build normal, nos aplicativos. Após mudar a interface, sincronize antes de testar o nativo:

```sh
pnpm run android:apk
pnpm run ios:sync
```

O primeiro comando compila um APK de debug. O segundo sincroniza o iOS; não substitui uma compilação no Xcode ou testes em aparelho. Arquivos gerados do Capacitor devem vir da CLI, incluindo caminhos pnpm e o manifesto Swift. Não edite manualmente arquivos marcados como gerados.

Uma compilação bem-sucedida não comprova atualização preservando dados, ciclo de vida ou funcionamento em aparelho. Faça essa validação antes da liberação. Não publique, assine builds de distribuição ou faça merge em `master` como parte de uma migração sem a decisão explícita do responsável.
