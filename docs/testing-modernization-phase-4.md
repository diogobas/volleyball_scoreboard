# Modernização — validação final da Fase 4

Branch `feat/modernization-phase-4-consolidation`, criada de `feat/code-modernization` após o merge do PR #24. O PR desta entrega tem a feature branch como destino e aguarda validação explícita. O PR principal #22 para `master` permanece em rascunho. Não foram feitos merge desta etapa, deploy ou envio às lojas.

## Consolidação

- `tsconfig.json` usa `strict: true`, `allowJs: false` e `noEmit: true`. O suporte temporário `checkJs` foi removido; a configuração JavaScript do ESLint não faz parte do programa TypeScript.
- Não existem `.js`/`.jsx` em `src`. ESLint rejeita a introdução dessas extensões na pasta, em vez de ignorá-las. A regra foi verificada com entradas virtuais das duas extensões.
- O lint não possui mais avisos ou exceções temporárias para código legado. Configuração de ferramenta, testes Node e código TypeScript têm seus ambientes explícitos.
- Scripts operacionais e testes SQL fora de `src` continuam JavaScript. Não foi necessária alteração do lockfile ou de dependências.
- `android/capacitor.settings.gradle` foi regenerado pela CLI Capacitor e agora usa o caminho pnpm da dependência instalada. O manifesto iOS gerado permanece igual ao versionado.
- As [convenções finais](code-conventions.md) documentam páginas, atoms/molecules/organisms, hooks, arrow functions, contratos, carregamento de páginas, testes e integração nativa.
- `test:build:browser` acrescenta verificação das entradas dos dois builds, carregamento sob demanda da administração, isolamento do banco do placar e recuperação após falha do chunk público.

A consolidação não muda telas, textos, URLs, regras, IDs de aplicativos, versões, contratos Supabase ou dados persistidos.

## Resultados executados

| Verificação | Resultado |
| --- | --- |
| Instalação pnpm com lockfile congelado e cache offline | Aprovada, sem alterações de dependências |
| Ausência de `.js`/`.jsx` em `src` e rejeição pelo lint | Aprovada |
| Tipos, lint e formatação | Aprovados, sem erros ou avisos de lint |
| `pnpm test` | 262 testes aprovados, sem falhas ou testes ignorados |
| Build normal e build público | Aprovados |
| Quadra, público, administração e comunidades no Chrome | Os quatro fluxos aprovados contra o build normal compilado |
| Entradas app/público e falha de carregamento no Chrome | Aprovadas contra os dois builds compilados |
| Sincronização Capacitor Android/iOS | Aprovada |
| Manifesto Swift gerado | Sem diferenças após sincronizar |
| APK Android de debug (`assembleDebug`, Java 21) | BUILD SUCCESSFUL |
| Assinatura do APK (`apksigner verify`) | Aprovada |
| Arquivos web do APK e do pacote iOS | Todos correspondem aos arquivos de `dist` |

Os testes Chrome simulam as APIs; não escrevem no Supabase. O teste de quadra inclui cancelamento/Escape/confirmação com conteúdo estável durante a animação, pontuação, recuperação offline, exclusão local, sincronização e fechamento do dia. Os demais testes cobrem cadastros, correções, perfis, estatísticas, filtros, paginação e permissões por comunidade/grupo.

Os builds emitiram avisos sobre o chunk inicial acima de 500 kB, repositórios `flatDir` do Capacitor e APIs Gradle depreciadas para uma futura migração ao Gradle 9. Ambos os builds web e o build Android passaram; esta modernização não atualiza Vite/Gradle/AGP ou muda a estratégia de imports aprovada.

## Reproduzir os checks

Use Node 22.13+ na linha 22 ou 24+, pnpm 10.27.0, Google Chrome e, para Android, Java 21/SDK 36.

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
pnpm run build
pnpm run build:public
```

Em dois terminais separados:

```sh
pnpm run preview --host 127.0.0.1 --port 5199 --strictPort
```

```sh
pnpm run preview:public --host 127.0.0.1 --port 5200 --strictPort
```

Em outro terminal:

```sh
BASE_URL=http://127.0.0.1:5199 pnpm run test:public:browser
BASE_URL=http://127.0.0.1:5199 pnpm run test:admin:browser
BASE_URL=http://127.0.0.1:5199 pnpm run test:communities:browser
BASE_URL=http://127.0.0.1:5199 pnpm run test:court:browser
APP_BASE_URL=http://127.0.0.1:5199 PUBLIC_BASE_URL=http://127.0.0.1:5200 pnpm run test:build:browser
```

Para os quatro fluxos com RPCs simuladas, o build precisa ter uma configuração pública Supabase válida. É possível compilar com `VITE_SUPABASE_URL=https://volleyball-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test` antes dos comandos `pnpm run build` e `pnpm run build:public`. Essa configuração fictícia é apenas para automação; não serve para testar login/sincronização reais. O teste das entradas bloqueia chamadas externas e não precisa de servidor Supabase.

Capturas ficam em `artifacts/public-navigation`, `artifacts/admin-navigation`, `artifacts/communities`, `artifacts/court-browser` e `artifacts/build-browser`, conforme o script. São arquivos locais, fora do Git.

Integração nativa:

```sh
pnpm run android:apk
pnpm exec cap sync ios
git diff --exit-code -- ios/App/CapApp-SPM/Package.swift
```

`android:apk` já compila o build normal e sincroniza o Android. Os nativos incluem `dist`, não `dist-public`. O comando iOS somente sincroniza; uma compilação no Xcode não foi executada nesta etapa.

## APK local

Arquivo: `android/app/build/outputs/apk/debug/app-debug.apk`.

- Tipo: debug; não é um pacote de distribuição para Google Play.
- App ID: `com.diogobastos.volleyballscoreboard`.
- Versão preservada: `1.2.0`, código `6`.
- Android mínimo: API 24; alvo: API 36.
- SHA-256 desta compilação: `71095293cb44b48ce42fc49e64f77071ff8c221cf2733acbc816d2ce1d833a2d`.

A assinatura de debug pode ser diferente da versão instalada pela loja. Se o Android impedir uma atualização por assinatura, não desinstale a versão existente para concluir o teste de preservação de dados; registre a condição e use um ambiente de teste separado. Nenhum APK foi instalado em aparelho como parte desta entrega.

## Validação final solicitada

1. No build normal, confira a abertura do placar e recuperação dos dados na mesma origem utilizada antes. No público, sem hash, deve aparecer a orientação para abrir um link compartilhado.
2. Repita o [roteiro funcional da Fase 3](testing-modernization-phase-3.md#validação-manual-solicitada), incluindo Close set → Cancel, Escape e confirmação. Confira textos, nomes, placar, estatísticas, filtros e histórico em desktop e janela estreita.
3. Com dados de um grupo exclusivo de testes, confira login/logout, comunidades/grupos autorizados, jogadores/perfis, Game days, partida histórica e correções. Confira o resultado público de uma sincronização. Salvar/sincronizar grava no Supabase configurado; partidas finalizadas continuam protegidas contra exclusão.
4. Em um Android de teste, com uma instalação compatível, confira abertura, pontuação, desfazer e troca de lados. Fique offline, feche e salve uma partida, encerre e reabra o app ainda offline. Os arquivos locais e a partida ativa devem continuar disponíveis.
5. Cancele a exclusão local; exclua apenas um arquivo descartável e reinicie. Reconecte e sincronize outra partida de teste, verificando confirmação, ausência de duplicação e resultados públicos.
6. Coloque o app em segundo plano e retome; teste retrato/paisagem. A conferência em aparelho não é substituída pelos testes de navegador ou pela compilação.

A suíte automatizada e a compilação estão concluídas. O comportamento em aparelho real, atualização preservando dados e a validação final pelo responsável permanecem como revisão desta entrega. Aprovar a etapa não autoriza implicitamente publicar ou integrar o PR principal em `master`: essa decisão continua explícita e separada.
