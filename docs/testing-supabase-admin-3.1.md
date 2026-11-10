# Configuração e aprovação da subfase 3.1 — Supabase e administradores

Branch: `feat/supabase-sync`, criada a partir da fase 2 aprovada.

O código pode ser usado sem configuração online: o placar, o cadastro local, as partidas e as estatísticas continuam funcionando. **Account & groups**, abaixo das abas, é a entrada para cadastro/login e administração online. As contas são para responsáveis pelo placar; jogadores cadastrados não precisam de conta.

## 1. Criar o projeto Supabase

1. Entre no [painel Supabase](https://supabase.com/dashboard) e crie um projeto dedicado para este aplicativo. Escolha o nome e a região desejados e guarde a senha do banco fora do repositório. Aguarde o projeto ficar disponível.
2. A conta usada no painel Supabase gerencia a infraestrutura; ela é diferente das contas que serão criadas dentro do app.
3. Abra o **SQL Editor**, crie uma consulta e execute o conteúdo completo de [20261106000100_groups_and_match_schema.sql](../supabase/migrations/20261106000100_groups_and_match_schema.sql).
4. Execute essa migração **uma única vez** em um projeto novo. Ela roda em transação; se houver erro, não tente remover tabelas existentes: guarde o erro para corrigirmos. Não há necessidade de inserir grupos manualmente pelo SQL Editor.
5. Devem existir no schema `public`: `groups`, `players`, `matches`, `match_sets`, `set_players` e `match_points`. No schema `private`: `group_admins`, `match_metadata` e `match_revisions`.
6. Na configuração da Data API, mantenha `private` fora dos schemas expostos. As funções administrativas públicas fazem sua própria autorização; os dados privados não têm acesso direto pelos clientes.

O [guia de tabelas do Supabase](https://supabase.com/docs/guides/database/tables) descreve o uso do SQL Editor. Esta entrega inclui a migração, mas não cria nem aplica alterações em um projeto remoto automaticamente.

## 2. Configurar e-mail e autenticação

1. Em **Authentication**, mantenha o provedor **Email** habilitado e **Confirm Email** ativado. O app usa e-mail e senha; a criação de grupos e a autorização por e-mail exigem contas confirmadas.
2. Em **URL Configuration**, use como **Site URL** o endereço de desenvolvimento que você abrirá no computador, por exemplo `http://localhost:5173`. A confirmação será feita no navegador; depois, volte ao app e faça login por senha.
3. A confirmação de e-mail precisa de entrega de mensagens funcionando. O serviço SMTP padrão do Supabase tem restrições: sem SMTP próprio, pode recusar destinatários que não pertencem à equipe do projeto. Veja o [guia oficial de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
4. Para validar o fluxo real de cadastro, use um endereço aceito pelo serviço de e-mail ou configure SMTP. Para um teste controlado com uma segunda conta, também é possível criá-la e confirmá-la pelo painel de usuários do Auth. Não conceda acesso ao painel do projeto a todos os administradores do app apenas para contornar restrições de e-mail.
5. Não desative a confirmação de e-mail como solução de produção: a autorização por e-mail depende da identidade confirmada. O [guia de Auth](https://supabase.com/docs/guides/auth/general-configuration) explica essas opções.

## 3. Configurar o app

1. No diretório do projeto:

   ```sh
   pnpm install --frozen-lockfile
   cp .env.example .env.local
   ```

2. Copie a **Project URL** e a **publishable key** do diálogo **Connect** ou de **Settings → API Keys** no Supabase. Preencha `.env.local`:

   ```dotenv
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
   ```

3. Use somente a chave pública. Não coloque senha do banco, `sb_secret_...` ou `service_role` no app ou em variáveis `VITE_`. O build verifica a configuração e recusa chaves privilegiadas. Projetos antigos podem usar `VITE_SUPABASE_ANON_KEY` com uma chave de papel `anon`; para projeto novo, prefira a publishable key. Consulte o [guia oficial de chaves](https://supabase.com/docs/guides/getting-started/api-keys).
4. `.env.local` fica ignorado pelo Git. Depois de mudar as variáveis, reinicie o servidor:

   ```sh
   pnpm test
   pnpm run dev
   ```

5. Abra no endereço e porta usados anteriormente para preservar seus dados locais. Sem essas variáveis, **Account & groups** deve informar que as contas online não estão configuradas, permitindo continuar jogando normalmente.

## 4. Cadastrar, entrar e criar grupo

1. No app, abra **Account & groups → Create an account**.
2. Cadastre uma conta A com e-mail válido e senha de pelo menos oito caracteres. Deve aparecer a orientação para confirmar o e-mail.
3. Confirme pelo e-mail e volte a **Sign in**. Uma senha errada deve apresentar erro, sem alterar a partida atual. Entre com a senha correta.
4. **My groups** deve começar vazio. Crie um grupo, por exemplo `Teste de vôlei`, com fuso `America/Toronto`.
5. A confirmação deve informar que você é o primeiro administrador. A lista **Administrators** deve mostrar sua conta; não deve permitir remover o único administrador.
6. Feche o diálogo e recarregue. Ao reabrir, a sessão e seu grupo devem continuar disponíveis. **Sign out** encerra a sessão deste aparelho e mantém os dados locais do placar.

## 5. Autorizar outra pessoa e conferir isolamento

1. Em outro perfil do navegador, cadastre e confirme uma conta B. Antes de ser autorizada, ela não deve ver o grupo A em **My groups**.
2. Com a conta A, abra seu grupo e informe o e-mail da conta B em **Administrator email → Add administrator**.
3. A lista deve mostrar as duas contas. Adicionar o mesmo e-mail novamente não deve duplicar a autorização. Um e-mail sem conta confirmada deve ser recusado.
4. Com a conta B, use **Refresh groups**. Ela deve passar a ver o grupo e poder administrar seus acessos.
5. Remova o acesso de B usando a conta A. Ao atualizar B, o grupo deve desaparecer de **My groups** e chamadas administrativas devem ser recusadas pelo servidor.
6. Uma conta C não autorizada pode criar seu próprio grupo, mas não administrar o grupo A. Os grupos e seus responsáveis são independentes.

### Conferir autorização pelo servidor

Além dos botões, você pode testar a API no Console do navegador usando o servidor Vite. Use um **grupo de teste**, com uma conta C que não seja administradora dele. Copie o UUID do grupo no painel ou com a conta A; IDs e nomes dos grupos são públicos.

```js
const { getRemoteClient } = await import('/src/remote/client.js');
const api = getRemoteClient();
const groupId = 'UUID-DO-GRUPO-A';

const admins = await api.rpc('list_group_admins', { p_group_id: groupId });
console.log(admins.error?.code); // esperado: 42501

const denied = await api.from('players').insert({ group_id: groupId, name: 'Teste sem autorização' });
console.log(denied.error?.code); // esperado: 42501, nenhum jogador criado

const direct = await api.from('groups').insert({ name: 'Tentativa direta', time_zone: 'UTC' });
console.log(direct.error?.code); // esperado: 42501; a criação passa pela RPC
```

Se qualquer tentativa sem autorização gravar dados ou listar administradores, interrompa a aprovação e informe o resultado. Os testes automatizados também verificam leitura pública, dados privados, permissões e restrições entre grupos.

## 6. Local, offline e aparelhos

1. Anote um placar em andamento. Entre, crie grupo, autorize alguém e saia da conta. A partida e o cadastro local devem continuar iguais.
2. Fique offline: o jogo, Undo, fechamento e History devem continuar funcionando. A administração online depende de conexão e deve mostrar falha recuperável, sem apagar dados.
3. Para compilar Android/iOS, configure primeiro `.env.local`, execute `pnpm run android:sync` ou `pnpm run ios:sync` e compile mantendo a instalação existente. As variáveis entram no build web copiado para o aplicativo.
4. Confirme a conta pelo e-mail no navegador e faça login por senha no app nativo; esta subfase não exige um fluxo de retorno por link para o aplicativo.
5. Confira os formulários em retrato e paisagem, a persistência da sessão e a preservação das partidas ao sair da conta.

## Testes e limites desta entrega

- `pnpm test` inclui as regras locais, o contrato das RPCs e uma execução da migração em PostgreSQL embarcado (PGlite). Os testes de banco usam contas de teste e uma implementação mínima de `auth.uid()`; não simulam as políticas SQL, que são executadas pelo PostgreSQL.
- Os testes no Chrome usam o SDK oficial com respostas de Auth/Data API simuladas. Não enviam e-mails nem criam contas reais. O fluxo hospedado de e-mail, JWT e Data API ainda precisa ser aprovado no projeto criado por você.
- A estrutura de partidas, sets, escalações, pontos, autoria privada e revisões já existe no servidor. Escrita direta de partidas não é permitida ao cliente: a gravação transacional por RPC será implementada na 3.3.
- A administração de grupos é online, mas os elencos locais continuam no **Development group**. Cadastro sincronizado, conciliação e ligação aos grupos reais entram na 3.2. As partidas locais não são enviadas nem apagadas nesta subfase.
- A consulta pública das tabelas de resultados é permitida pelo banco; a página pública e suas estatísticas serão entregues na fase 4. E-mails, responsáveis pelos envios e revisões administrativas ficam fora dessas tabelas públicas.

Para aprovar a 3.1, valide login/cadastro, criação, autorização/revogação e isolamento com contas diferentes no Supabase real. Informe o resultado antes de avançarmos para a 3.2.
