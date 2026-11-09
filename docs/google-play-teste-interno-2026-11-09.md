# Publicar o teste interno no Google Play — 9 de novembro de 2026

O pacote desta entrega é **Volleyball Scoreboard 1.2.0 (6)**. O teste interno permite distribuir o app a até 100 pessoas, com acesso controlado pelas contas Google informadas. É possível começar antes de concluir toda a configuração da loja. [Guia oficial de testes](https://support.google.com/googleplay/android-developer/answer/9845334?hl=pt-BR).

## Arquivos prontos neste Mac

- Pacote para enviar: [VolleyballScoreboard-1.2.0-6.aab](../artifacts/android/VolleyballScoreboard-1.2.0-6.aab).
- Notas para copiar no Console: [GooglePlayReleaseNotes-1.2.0-6.txt](../release/GooglePlayReleaseNotes-1.2.0-6.txt).
- Identificador: `com.diogobastos.volleyballscoreboard`.
- Versão: `1.2.0`; código da versão: `6`.
- Android mínimo: 7.0 / API 24; destino: API 36.

O AAB usa a chave de upload já existente. A assinatura foi verificada; os arquivos de evidência ficam em `artifacts/android/verify-1.2.0-6.log` e `VolleyballScoreboard-1.2.0-6.aab.sha256`. Não é necessário compilar novamente amanhã.

## Passo a passo

1. Entre no [Google Play Console](https://play.google.com/console/) com a conta de desenvolvedor responsável. Se o app já existir, abra-o. Caso contrário, escolha **Criar app**, informe **Volleyball Scoreboard**, idioma padrão **inglês (Estados Unidos / en-US)**, tipo **App** e a distribuição gratuita prevista para este projeto. Complete o contato e as declarações solicitadas. [Criação do app](https://support.google.com/googleplay/android-developer/answer/9859152?hl=pt-BR).

2. Abra **Testar e lançar → Teste → Teste interno**. É essa faixa que você usará para distribuir a primeira versão ao grupo pequeno.

3. Na área **Testadores**, crie uma lista com seu e-mail e os e-mails de quem vai testar. Use as mesmas contas Google que cada pessoa utiliza no Google Play do Android. Salve a lista e associe-a ao teste.

4. Na área **Versões**, crie uma versão. Se já houver um rascunho dessa publicação, continue nele. Confira a configuração da **Assinatura de apps do Google Play** apresentada pelo Console. Para este projeto, mantenha o gerenciamento da assinatura final pelo Google e a chave de upload usada no AAB. [Assinatura de apps](https://support.google.com/googleplay/android-developer/answer/9842756?hl=pt-BR).

5. Faça upload do arquivo **VolleyballScoreboard-1.2.0-6.aab** indicado acima. Aguarde a análise e confira no resumo: pacote `com.diogobastos.volleyballscoreboard`, versão `1.2.0`, código `6`. Se o código 6 já tiver sido usado por outro envio, será preciso gerar um código superior; renomear o arquivo não altera esse código. O identificador do pacote é permanente. [Pacotes e versões](https://support.google.com/googleplay/android-developer/answer/9859152?hl=pt-BR).

6. Use **1.2.0 (6)** como nome da versão e copie as notas do arquivo fornecido, incluindo as tags `<en-US>` de idioma. Salve, revise e resolva os bloqueios que o Console indicar. Confirme a publicação **na faixa de teste interno**. Não há envio ao Google Play executado por este roteiro até você confirmar essa etapa. [Preparação e publicação da versão](https://support.google.com/googleplay/android-developer/answer/9859348?hl=pt-BR).

7. Quando a versão estiver disponível, volte a **Testadores** e copie o link de participação. Compartilhe esse link com o grupo. A primeira disponibilização do link pode demorar; confira o estado da versão no Console. [Disponibilização do teste](https://support.google.com/googleplay/android-developer/answer/9845334?hl=pt-BR).

8. No Android, abra o link usando uma conta cadastrada na lista, aceite participar e siga para a instalação pelo Google Play. Confira que a versão instalada é **1.2.0 (6)**.

## Primeiro teste no aparelho

1. Carregue uma escalação com o código de cinco caracteres de um dia de teste.
2. Ative o modo avião, marque pontos, use Undo, feche um set e salve a partida.
3. Feche e reabra o app; confira a partida salva.
4. Cancele uma exclusão e confira que a partida permanece; exclua apenas uma partida de teste descartável.
5. Volte à internet, sincronize e confirme no site que o resultado entrou como finalizado, com os pontos corretos.

Se uma instalação por APK antigo causar conflito de assinatura, sincronize e confira as partidas pendentes antes de desinstalar: a desinstalação remove os dados locais. Guarde a chave de upload e `android/keystore.properties` em backup privado para as próximas atualizações.
