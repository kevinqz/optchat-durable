# OptChat Durable

[English](./README.md) · [Documentação](./docs/README.md) · [Créditos](./CREDITS.md) · [Como contribuir](./CONTRIBUTING.md)

[![CI](https://github.com/kevinqz/optchat-durable/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kevinqz/optchat-durable/actions/workflows/ci.yml)

**Memória hierárquica de conversas para o Pi.** O OptChat Durable preserva os registros originais, constrói uma árvore pesquisável de resumos e fornece uma visão limitada da memória a cada novo turno. O modelo pode recuperar o texto original quando o resumo não basta.

Esta implementação independente combina o **[desenho OptChat de Victor Taelin](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449)** com o **[Pi Durable](https://github.com/earendil-works/pi/tree/v1.1.0/packages/durable)** de **Mario Zechner, Earendil Works e contribuidores do Pi**. Usa os pacotes oficiais, sem modificações. Não exige uma distribuição customizada do Pi nem a instalação separada do OptMem. Os [créditos e referências](./CREDITS.md) distinguem as contribuições e licenças; não há alegação de endosso dos autores.

## Escolha como usar

| Quero…                                                           | Comece aqui                                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Adicionar memória às minhas conversas normais no coding-agent Pi | **[Instalar no Pi](#instalar-no-pi)** — caminho recomendado para usuários do Pi; mantém ferramentas, permissões e streaming |
| Experimentar sem conta de modelo ou cobrança de API              | **[Rodar a demonstração](#experimentar-a-demonstração-independente)** — chat local com respostas simuladas                  |
| Adicionar memória e pedidos enfileirados ao meu aplicativo       | **[Usar o SDK TypeScript](./docs/guides/sdk.md)** — com seu harness Pi Durable, providers e ferramentas                     |
| Contribuir ou executar o código-fonte                            | **[Desenvolver localmente](#desenvolver)** — clonar, experimentar e validar as alterações                                   |

O pacote Pi também mantém a conversa separada `/optchat chat` da versão 0.3. Ela tem histórico e fila próprios; não é a conversa normal do coding-agent.

## Instalar no Pi

**O Pi Durable é instalado automaticamente como dependência do OptChat.** Pi é o coding-agent de terminal que fornece o comando `pi`; Pi Durable é a biblioteca JavaScript/TypeScript usada nesta integração. Você não precisa instalar ou configurar essa biblioteca separadamente. Se já desenvolve um aplicativo com a biblioteca Pi Durable, siga o [guia de integração do SDK](./docs/guides/sdk.md); adicionar OptChat ao seu próprio harness exige a integração em código ali documentada.

A versão publicada é **[0.4.1](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.1)**, qualificada com **Pi 1.1.0**, **Node 22.19+**, **macOS e Linux**. Tenha Node, npm e Git disponíveis no terminal. Outras versões do Pi e Windows não foram qualificados. Os comandos abaixo fixam a release; a `main` pode conter alterações posteriores descritas em [Unreleased](./CHANGELOG.md#unreleased).

Esta versão inclui a correção para o problema de prefixo de cache da revisão de 8 de outubro do Gist de Taelin. Qualidade comparativa das respostas e economia de cache ainda não foram medidas; esses benchmarks são opcionais. Veja [o comportamento de cache, a integração nativa e os limites da medição](./docs/reference/cache.md).

Vai atualizar de uma candidata anterior? Conclua as tarefas pendentes, feche o Pi e preserve um backup completo antes de instalar a 0.4.1. Siga o [procedimento de atualização](./docs/guides/upgrades.md).

### Já usa Pi

Com Pi 1.1.0 instalado (`pi --version`), execute no diretório do seu projeto:

```sh
pi install git:github.com/kevinqz/optchat-durable@v0.4.1
```

Depois use `/reload` na sessão aberta, ou inicie `pi`. Mantenha seu login e modelo selecionado e continue enviando mensagens normalmente. O OptChat importa o histórico textual disponível no ramo selecionado da sessão ao preparar o próximo turno; não repete ferramentas anteriores. A primeira preparação de um histórico longo pode levar mais tempo e gerar chamadas de resumo. Use `/resume` para reabrir uma sessão anterior.

### Começando do zero

Com Node 22.19+, npm e Git disponíveis, execute no diretório do seu projeto:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.1.0
pi install git:github.com/kevinqz/optchat-durable@v0.4.1
pi
```

O primeiro comando usa o [método oficial de instalação do Pi pelo npm](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/README.md#getting-started), fixado na versão qualificada. O segundo instala OptChat e suas dependências. Não há uma etapa separada de instalação do Pi Durable, clonagem do repositório ou compilação.

Dentro do Pi, use `/login` para conectar seu provedor e `/model` para selecionar um modelo concreto com janela de contexto de pelo menos 40 mil tokens. O OptChat usa essas credenciais; não exige outro arquivo de credenciais. Para experimentar sem autenticação, use a [demonstração independente](#experimentar-a-demonstração-independente).

### Confira qualquer uma das instalações

Envie uma entrada por vez, aguardando cada resposta:

```text
Meu projeto é Aurora.
Qual é o nome do meu projeto?
/optchat status
/optchat search Aurora
```

Depois do primeiro turno concluído, o status deve mostrar `"started": true`, `"mode": "native"` e o diretório de armazenamento. A busca deve retornar a mensagem original contendo `Aurora`. Isso verifica o registro e a recuperação independentemente da resposta do modelo. Em uma sessão nova, `/optchat zoom 0 1` recupera o primeiro registro original.

Ao pedir ao modelo que recupere uma memória, indique a sessão atual do Pi se necessário. A conversa separada `/optchat chat` tem histórico próprio; o [guia do Pi](./docs/guides/pi.md) explica como a ferramenta seleciona o histórico.

Continue usando o Pi normalmente. Use `/resume` para reabrir aquela sessão; `/new` inicia uma memória separada. O [guia do Pi](./docs/guides/pi.md) também explica instalação por projeto, atualização e remoção.

Resumos usam a cobrança normal do provedor. O compactador adota inicialmente o modelo selecionado, salvo se você informar `--optchat-compactor provider/model-id`. A configuração dele fica salva com o arquivo de memória. O [guia do Pi](./docs/guides/pi.md) cobre limites, comandos, sessões, atualizações e recuperação.

## Experimentar a demonstração independente

Use Node 22.19+ em macOS ou Linux. Este caminho não exige o CLI do Pi, uma instalação separada do Pi Durable nem conta de provedor; o npm instala as dependências necessárias:

```sh
npm install -g https://github.com/kevinqz/optchat-durable/releases/download/v0.4.1/optchat-durable-0.4.1.tgz
optchat-durable --demo
```

Abra <http://127.0.0.1:4317> e envie uma mensagem. A demonstração usa persistência local real e **respostas e resumos simulados**, sem chamadas à API de modelos. Por padrão, o histórico fica em `.optchat/demo/`, relativo ao diretório onde você executou o comando. Encerre com `Ctrl+C`; executar novamente no mesmo diretório reabre esse histórico. As ferramentas do modelo na demonstração apenas consultam a memória; não executam comandos de shell nem editam arquivos do projeto.

O [guia do aplicativo](./docs/guides/standalone.md) explica providers reais, comandos e armazenamento. A distribuição ocorre pelas releases do GitHub; **não há publicação no registro npm**. Use a URL completa.

## Se a primeira execução encontrar um problema

| Sintoma                                          | Próximo passo                                                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Pi não reconhece `/optchat`                      | Confira `pi list`, use `/reload` e confirme em `pi config` que a extensão está habilitada                                                     |
| O status mostra `"started": false`               | Envie primeiro uma mensagem normal no Pi; instalar e consultar o status não cria o arquivo de memória                                         |
| Erro de autenticação ou modelo                   | Confira `/login` e `/model`; use um modelo concreto com pelo menos 40 mil tokens de contexto. Leia o erro exibido antes de tentar novamente   |
| O armazenamento já está aberto em outro processo | Encerre o processo que usa aquele histórico antes de reabrir; cada arquivo de memória permite apenas um processo escritor                     |
| A porta 4317 da demonstração está ocupada        | Se outro aplicativo usa a porta, execute `OPTCHAT_PORT=4318 optchat-durable --demo`. Encerre antes uma demonstração que use o mesmo histórico |

Para trabalho interrompido, consulte a [recuperação no Pi](./docs/guides/pi.md#recovery-boundaries) ou o [armazenamento do aplicativo](./docs/guides/standalone.md#storage-backup-and-recovery). Se o problema continuar, [abra um relato de bug](https://github.com/kevinqz/optchat-durable/issues/new?template=bug_report.yml) com versões e uma reprodução com dados fictícios. Relate problemas sensíveis pelo canal de [Segurança](./SECURITY.md).

A release também oferece [inspeção e exportação offline do arquivo de memória](./docs/guides/recovery.md), inclusive do journal preservado antes de o Pi salvar seu primeiro histórico. Esses comandos não iniciam modelos nem repetem ações do host.

Aplicativos com o SDK do código atual devem chamar `await optchat.prepare(storage)` antes de `Harness.open()`. A integração do Pi e `openApp` fazem isso automaticamente. Consulte [compatibilidade e atualizações](./docs/guides/upgrades.md) antes de atualizar um arquivo de memória existente.

## O que a memória faz

1. Indexa o texto da conversa com referências aos registros originais. Blocos de raciocínio ficam fora da memória.
2. Constrói resumos binários, com alvo padrão de 512 bytes UTF-8 por nó. Textos curtos podem permanecer integrais, sem chamada ao modelo.
3. Mantém uma visão cronológica limitada, com mais detalhe para registros recentes. Os limites contam bytes e marcação, não tokens exatos.
4. Congela essa visão para um turno. A entrada e o laço de ferramentas atuais permanecem completos; uma preparação incompleta interrompe o pedido.
5. Oferece recuperação paginada do texto original, busca literal sem distinguir maiúsculas/minúsculas e datas. Resumos são um índice, não prova da redação original.

A [arquitetura](./docs/reference/architecture.md) distingue a memória do Pi nativo da execução de pedidos no SDK. A [matriz de conformidade](./docs/reference/conformance.md) registra as adaptações da proposta do Taelin.

## Garantias e limites

- **A memória é recuperável; lembrança perfeita não é garantida.** O modelo pode omitir fatos ou deixar de recuperá-los. Qualidade, economia de cache, custo e latência exigem avaliação com providers reais.
- **A execução das ferramentas nativas continua no Pi.** O adaptador não repete ações externas automaticamente após uma queda. Chamadas de resumo podem ser repetidas e cobradas novamente.
- **Os dados são locais e não criptografados.** Providers reais recebem contexto e material a resumir. Edições de contexto afetam visões e consultas futuras; não apagam arquivos imutáveis nem backups.
- **O `--no-session` nativo é temporário.** Abrir explicitamente a conversa durável separada ainda cria dados persistentes.
- **A interface web é local e para um usuário.** Não é um serviço hospedado, uma busca semântica/vetorial nem uma memória automática de todos os arquivos do projeto. Sua interface atual está em português.

A versão **0.4.0** consolida a memória nativa no Pi, a recuperação e a integração pelo SDK. Seu código de execução, sem mudanças nesta release, passou em **106 testes determinísticos** e nas verificações de pacote, instalação e atualização na [matriz macOS/Ubuntu × Node 22.19/24](https://github.com/kevinqz/optchat-durable/actions/runs/37942322629). Também observamos login real pelo ChatGPT, recuperação de memória e renovação nativa do login. O [registro da release](./docs/development/validation.md#functional-release-040) distingue essas verificações das medições de desempenho ainda não realizadas.

O repositório inclui protocolos fixados e avaliadores para [qualidade das respostas](./docs/development/evaluation.md) e [uso contínuo do cache](./docs/development/cache-evaluation.md), ambos comparados ao Pi comum. Desenvolvedores também podem [avaliar pelo login nativo do Pi com ChatGPT](./docs/development/pi-subscription-evaluation.md), com históricos isolados e limites compartilhados de tokens e chamadas, sem recorrer a uma chave de API. Esses estudos extensivos são opcionais e não foram executados; não impedem a instalação nem o projeto complementar. Os ensaios sintéticos de armazenamento até 100 mil registros curtos estão vinculados às revisões registradas; não estabelecem qualidade com modelos reais nem desempenho geral para arquivos grandes.

O [roadmap](./docs/development/roadmap.md) separa a release funcional dos estudos comparativos opcionais. A aplicação separada [Pi Durable Agent](https://github.com/kevinqz/pi-durable-agent) publicou a versão operacional 0.1.0, com hospedagem Cloudflare, ações aprovadas sobre notas da sessão e checkpoints coordenados. Seu [roadmap e limites de qualificação](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/roadmap.md) ficam no outro repositório. Essas funções da aplicação não acrescentam dependências ou capacidades ao pacote de memória OptChat.

A [revisão de composição com os projetos originais](./docs/development/upstream-composition.md) separa recursos já fornecidos pelo Pi das responsabilidades do OptChat e define a sequência de simplificação nos dois repositórios.

## Desenvolver

Clone o repositório e execute a demonstração pelo código-fonte, sem credenciais de modelos:

```sh
git clone https://github.com/kevinqz/optchat-durable.git
cd optchat-durable
npm ci
npm run demo
```

Abra <http://127.0.0.1:4317>. Encerre com `Ctrl+C` antes de outro comando abrir o mesmo histórico. Depois, valide as alterações e experimente o exemplo do SDK:

```sh
npm run check:local
node examples/native-host.mjs
```

`npm run format` aplica a formatação do repositório. Para experimentar o checkout como extensão do Pi, execute `pi -e .` na raiz depois de `npm ci`; ele usa o TypeScript diretamente e dispensa compilação. Habilite apenas uma cópia do OptChat nesse perfil. O exemplo do SDK usa um provider simulado e armazenamento temporário em memória.

Execute esses comandos em um checkout desta revisão. `check:local` executa todas as verificações de engenharia e distribuição na máquina, sem push ou GitHub Actions. As verificações e a demonstração não usam credenciais de modelos reais; a distribuição precisa de loopback local e de acesso ao npm ou um cache já preenchido. O [caminho offline documentado](./docs/development/validation.md#run-without-github-or-registry-downloads) também usa o arquivo da versão anterior salvo localmente, com checksum verificado. Conversas normais no Pi usam seu provedor selecionado. Consulte o [mapa e padrões do repositório](./docs/development/repository.md), o [fluxo de contribuição](./CONTRIBUTING.md) e o [processo de release](./docs/development/releases.md). Os guias detalhados em inglês são a referência técnica; este README apresenta os mesmos caminhos de uso em português.

## Licença

[MIT](./LICENSE) para o código e a documentação originais deste repositório. O gist OptChat é referenciado, não distribuído ou relicenciado. Dependências mantêm suas próprias licenças. [CITATION.cff](./CITATION.cff), [NOTICE](./NOTICE) e os [avisos de terceiros](./THIRD_PARTY_NOTICES.md) acompanham a distribuição. Use `optchat-durable credits` para consultar a atribuição localmente.
