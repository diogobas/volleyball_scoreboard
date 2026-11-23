# Modernização — validação da Fase 1

Esta fase prepara pnpm, TypeScript, ESLint e Prettier. A organização dos componentes, a migração do App e os hooks ficam para a Fase 2, após validação explícita. Não há deploy nem migração de dados.

## Preparação

Use Node 22.13+ na linha 22, ou Node 24+. O pnpm do projeto é 10.27.0. Com Corepack instalado, execute `corepack enable` e `corepack install`; se necessário, instale essa versão de pnpm pelo método do seu ambiente.

```sh
pnpm --version
pnpm install --frozen-lockfile
```

O lockfile único é `pnpm-lock.yaml`. As dependências existentes devem conservar as versões do lockfile anterior; as adições são ferramentas de desenvolvimento.

## Verificações automatizadas

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
pnpm run build
pnpm run build:public
```

Resultado esperado: checagens sem erros, testes aprovados e saídas em `dist/` e `dist-public/`. ESLint pode apresentar avisos de dependências de hooks no JavaScript legado; eles serão tratados durante as extrações nas próximas fases. Não aplique correções automáticas de dependências de efeitos durante esta validação.

TypeScript é estrito nos arquivos `.ts`/`.tsx`. O código `.js`/`.jsx` ainda é aceito sem checagem de tipos durante a transição; portanto, passar em `typecheck` nesta fase não significa que o aplicativo inteiro já foi tipado.

## Validação manual

1. Execute `pnpm run dev` e abra o endereço habitual do app, mantendo a mesma origem para recuperar os dados existentes.
2. Em `/#/app`, confira a partida recuperada, marque um ponto, desfaça e alterne entre Game e Statistics. Confira a aparência e o indicador de salvamento.
3. Recarregue e confirme que a partida continua disponível.
4. Confira que `/#/groups` e `/#/admin` abrem como antes. Acesso online continua dependendo do `.env.local` existente.
5. Opcionalmente, use `pnpm run preview` e `pnpm run preview:public` para conferir os builds. Portas diferentes têm armazenamento local separado do servidor de desenvolvimento.

## Aprovação

Após revisar as alterações e testar os fluxos acima, aprove explicitamente a Fase 1 ou informe os ajustes necessários. A Fase 2 só começa depois dessa aprovação.

## Resultado automatizado desta entrega

- Instalação limpa com `CI=true pnpm install --frozen-lockfile`: aprovada.
- As 17 dependências diretas originais conservaram suas versões.
- `typecheck` e `format:check`: aprovados.
- `lint`: nenhum erro; cinco avisos legados de hooks em App, CommunityAdministration, GroupAdministration, PlayerProfileEdit e GameDayAdministration.
- `pnpm test`: 243 testes aprovados, nenhum erro ou teste ignorado.
- Builds do app e do site público: aprovados; Vite emite aviso de bundle acima de 500 kB.
- Comparação dos 88 arquivos preexistentes de `src`: alterações equivalentes à aplicação do Prettier, sem outras mudanças de código.
- Scripts de publicação: sintaxe JavaScript/Python verificada; nenhuma publicação executada.

Validação manual, execução do CI hospedado e compilação nativa não foram realizadas nesta fase. Os comandos do CI e dos fluxos nativos foram atualizados; a validação nativa completa permanece na Fase 4.
