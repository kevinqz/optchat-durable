# OptChat Durable

[English](./README.md) · [Documentação](./docs/README.md) · [Créditos](./CREDITS.md) · [Como contribuir](./CONTRIBUTING.md)

**Memória hierárquica de conversas para o Pi.** O OptChat Durable preserva os registros originais, constrói uma árvore pesquisável de resumos e fornece uma visão limitada da memória a cada novo turno. O modelo pode recuperar o texto original quando o resumo não basta.

Esta implementação independente combina o **[desenho OptChat de Victor Taelin](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449)** com o **[Pi Durable](https://github.com/earendil-works/pi/tree/v1.1.0/packages/durable)** de **Mario Zechner, Earendil Works e contribuidores do Pi**. Usa os pacotes oficiais, sem modificações. Não exige uma distribuição customizada do Pi nem a instalação separada do OptMem. Os [créditos e referências](./CREDITS.md) distinguem as contribuições e licenças; não há alegação de endosso dos autores.

## Escolha como usar

| Entrada                                                    | O que oferece                                                                               | Quem executa ferramentas e chamadas de modelo                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **[Pacote Pi](./docs/guides/pi.md)**                       | Memória para conversas normais do coding-agent, acompanhando a sessão e o ramo selecionados | O Pi mantém execução, permissões, streaming e steering; Durable executa os resumos |
| **[Aplicativo independente](./docs/guides/standalone.md)** | Chat local no navegador e CLI, com fila durável de pedidos                                  | Pi Durable; o modelo dispõe apenas de ferramentas de consulta à memória            |
| **[SDK TypeScript](./docs/guides/sdk.md)**                 | Memória e pedidos enfileirados no seu próprio hospedeiro Pi Durable                         | Seu harness, seus providers e as ferramentas selecionadas explicitamente           |

O pacote Pi também mantém a conversa separada `/optchat chat` da versão 0.3. Ela tem histórico e fila próprios; não é a conversa normal do coding-agent.

## Instalar no Pi

A candidata publicada é **[0.4.0-rc.1](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.0-rc.1)**, qualificada com **Pi 1.1.0**, **Node 22.19+**, **macOS e Linux**. Outras versões do Pi e Windows não foram qualificados.

```sh
pi install git:github.com/kevinqz/optchat-durable@v0.4.0-rc.1
pi
```

Em uma sessão Pi já aberta, use `/reload`. Faça login pelo `/login` do Pi, escolha um modelo concreto em `/model` e **envie mensagens normalmente**. Esta integração não exige compilação nem outro arquivo de credenciais.

```text
Meu projeto é Aurora.
Qual é o nome do meu projeto?
/optchat status
/optchat search Aurora
/optchat zoom 0 1
```

Resumos usam a cobrança normal do provedor. O compactador adota inicialmente o modelo selecionado, salvo se você informar `--optchat-compactor provider/model-id`. A configuração dele fica salva com o arquivo de memória. O [guia do Pi](./docs/guides/pi.md) cobre limites, comandos, sessões, atualizações e recuperação.

## Experimentar a demonstração independente

```sh
npm install -g https://github.com/kevinqz/optchat-durable/releases/download/v0.4.0-rc.1/optchat-durable-0.4.0-rc.1.tgz
optchat-durable --demo
```

Abra <http://127.0.0.1:4317>. A demonstração usa persistência local real e **respostas e resumos simulados**, sem chamadas à API de modelos. O [guia do aplicativo](./docs/guides/standalone.md) explica providers reais, comandos e armazenamento. A distribuição ocorre pelas releases do GitHub; **não há publicação no registro npm**. Use a URL completa.

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

A candidata publicada passou em **40 testes determinísticos**, na matriz macOS/Ubuntu × Node 22.19/24, nas instalações do pacote e na recuperação após queda de processo. A [validação](./docs/development/validation.md) separa essas evidências do comportamento ainda não qualificado em providers, imagens e desempenho.

## Desenvolver

```sh
npm ci
npm run check
npm run build
npm run check:package
npm run check:pi
```

Execute esses comandos em um checkout desta revisão. Eles não usam credenciais de modelos reais; os verificadores de distribuição precisam de acesso ao npm e a loopback local. Consulte o [mapa e padrões do repositório](./docs/development/repository.md), o [fluxo de contribuição](./CONTRIBUTING.md) e o [processo de release](./docs/development/releases.md). Os guias detalhados em inglês são a referência técnica; este README apresenta os mesmos caminhos de uso em português.

## Licença

[MIT](./LICENSE) para o código e a documentação originais deste repositório. O gist OptChat é referenciado, não distribuído ou relicenciado. Dependências mantêm suas próprias licenças. [CITATION.cff](./CITATION.cff), [NOTICE](./NOTICE) e os [avisos de terceiros](./THIRD_PARTY_NOTICES.md) acompanham a distribuição. Use `optchat-durable credits` para consultar a atribuição localmente.
