# OptChat Durable

[English](./README.md) · [Integração nativa](./examples/README.md)

Chat local com a memória hierárquica do [OptChat de Victor Taelin](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449), implementado diretamente sobre o [Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable). O Pi mantém o histórico, executa os modelos e ferramentas, persiste as tarefas e retoma o trabalho. O OptChat fornece a árvore de resumos e a visão de memória usada em cada nova resposta.

Há uma interface no navegador, um terminal interativo e uma API TypeScript. Esta é uma implementação independente da especificação; não é um pacote oficial do autor do OptChat.

Usa as bibliotecas **oficiais e sem modificações** do Pi. Ninguém precisa instalar um fork ou distribuição customizada. O pacote oferece um aplicativo pronto e uma extensão do **SDK Pi Durable** para outros aplicativos. Não é uma extensão instalável via `pi install` no Pi coding-agent CLI.

## Instalar a versão pronta

Requer Node.js 22.19.0 ou superior. Instale o pacote compilado da release pública:

```sh
npm install -g https://github.com/kevinqz/optchat-durable/releases/download/v0.1.0/optchat-durable-0.1.0.tgz
optchat-durable --demo
```

Abra http://127.0.0.1:4317. Para usar modelos reais, encerre a demonstração, configure a chave do provedor no ambiente ou em um `.env` privado no diretório atual e execute `optchat-durable`. Abaixo, os comandos `npm run dev -- ...` são para quem clona o código; na instalação pronta, use `optchat-durable ...`.

A distribuição é feita pelo GitHub; o pacote **ainda não foi publicado no registro npm**. Use a URL completa. Sem `-g`, ele pode ser instalado como dependência local e executado com `npx optchat-durable`. macOS e Linux são as plataformas qualificadas; Windows ainda não foi qualificado.

## Integrar em outro aplicativo

Instale a mesma release com `npm install URL_DA_RELEASE`, sem `-g`. Importe `openApp` e `configFromEnv` de `optchat-durable` para obter o aplicativo completo, ou `createOptChat` de `optchat-durable/extension` para usar o próprio harness, armazenamento e providers do Pi.

A extensão é registrada antes de abrir o harness; o controlador anexado a uma conversa dedicada administra a fila e a memória. Mensagens devem entrar por `enqueue()`. O exemplo [native-host.mjs](./examples/native-host.mjs) é executável sem credenciais, e o [contrato de integração](./examples/README.md) explica as responsabilidades do aplicativo hospedeiro. Importar a biblioteca não carrega `.env` nem altera a configuração global do Pi.

O código desta implementação está sob [licença MIT](./LICENSE), com créditos ao OptChat e ao Pi em [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Executar a partir do código

Requisitos: Node.js **22.19 ou superior** e npm. As três bibliotecas Pi estão fixadas em **1.0.4**, com `package-lock.json`.

```sh
git clone https://github.com/kevinqz/optchat-durable.git
cd optchat-durable
npm ci
npm run demo
```

Abra **http://127.0.0.1:4317**. A demonstração usa o runtime, armazenamento e tarefas reais do Pi, com **respostas e resumos simulados**. Ela não chama APIs e não avalia a qualidade de uma IA.

Para conversar com um modelo real:

1. Encerre a demonstração com `Ctrl+C`.
2. Copie `.env.example` para `.env` e preencha `OPENAI_API_KEY`. O aplicativo carrega esse arquivo local; variáveis já definidas no ambiente prevalecem.
3. Execute `npm run dev`.

O padrão é `openai/gpt-6-sol` na conversa e `openai/gpt-6-luna` na compactação. Ambos podem ser substituídos. Para Anthropic, defina `OPTCHAT_PROVIDER=anthropic` e `ANTHROPIC_API_KEY`; os padrões passam a ser `claude-opus-4-8` e `claude-haiku-4-5`. Use `npm run dev -- models` para consultar o catálogo da versão instalada. A disponibilidade efetiva depende da conta do provedor.

As chaves ficam no processo do servidor. A aplicação usa os providers e a resolução de autenticação do **pi-ai**; não lê nem modifica a configuração do Pi CLI. Não precisa instalar OptMem separadamente.

```sh
npm run dev -- chat                    # terminal interativo
npm run dev -- ask "Meu projeto é Aurora"
npm run dev -- status
npm run dev -- zoom 0 1                # original da mensagem 0
npm run dev -- zoom 0 8                # os dois filhos do intervalo 0..7
npm run dev -- search "Aurora"          # busca literal; continue pelo campo next
npm run build
npm start                             # interface usando JavaScript compilado
```

Somente **um processo** pode abrir cada diretório. Encerre a interface antes de usar outro comando no mesmo histórico. Comandos com `--demo` usam a demonstração. Os diretórios padrão são `.optchat/live` e `.optchat/demo`, relativos ao diretório de onde você executa o comando; não se misturam. Se você definir `OPTCHAT_DATA_DIR`, a separação passa a ser sua responsabilidade.

`status`, `zoom` e `search` não retomam tarefas pendentes e não exigem credenciais de API. Abrir a interface, o chat ou enviar uma mensagem habilita a retomada. A interface mostra os 50 pedidos mais recentes; a árvore e a busca continuam acessando todo o histórico indexado.

## O que está implementado

- Registro original do Pi preservado; índice de memória com ponteiros para entradas e mensagens de origem.
- Árvore estritamente binária, resumos com alvo de 512 bytes UTF-8, mensagens pequenas e concatenações curtas sem chamada ao modelo.
- Folhas resumidas em ordem; até oito tarefas de compactação concorrentes, com conversas filhas nativas e sem ferramentas.
- Visão cronológica que cobre o histórico inteiro, com orçamento padrão de 128.000 bytes **incluindo a marcação**. Ela só acrescenta partes e une irmãos; nunca divide partes já consolidadas.
- Resumos e a própria partição persistidos em documentos Pi. Cada nova resposta espera a memória ficar pronta, congela a visão e inicia um contexto novo antes de inserir a mensagem completa.
- Ferramentas nativas `zoom`, `date` e `search`. Zoom no original é paginado por bytes UTF-8, com referências ao registro do Pi, sem perder o restante do texto.
- Fila de mensagens durável, IDs de requisição idempotentes, cancelamento, retomada automática ao reabrir, progresso na interface e uso/custo contabilizados pelo Pi.
- JSONL nativo com `fsync: true` e trava de escritor liberada pelo sistema operacional após uma queda.

Na interface, mensagens enviadas durante uma resposta entram na **fila**, e cada uma inicia sua própria execução com memória preparada. Não há injeção de mensagens no meio da resposta nesta versão. As ferramentas disponíveis consultam somente a memória; este aplicativo não concede shell, acesso a arquivos de outros projetos, e-mail ou navegador ao modelo.

## Persistência e recuperação

O estado fica dentro do diretório selecionado:

```text
.optchat/live/
  .writer-lock.sqlite    # somente a trava do processo, sem histórico
  pi/                    # armazenamento JSONL nativo: entradas, tarefas e documentos
```

A fila é registrada **antes** de preparar a memória. O reset de contexto, a visão congelada e o checkpoint da tarefa são gravados em uma única transação. A chamada ao modelo usa uma submissão nativa com `requestId` estável. Reiniciar não reinsere a mensagem nem troca a visão de uma chamada que já começou.

`Ctrl+C` encerra o processo preservando tarefas pendentes. Ao abrir novamente com os mesmos modelos e credenciais, o Pi continua. O botão **Cancelar** pede o aborto da mensagem; ele não apaga seu registro. Uma falha na compactação bloqueia a próxima resposta e aparece na interface; não há resumo truncado inventado para continuar. Depois de corrigir a causa, envie uma nova mensagem ou reutilize o texto pela interface.

**Uma requisição externa ao modelo pode ser reenviada após uma queda**, caso a resposta ainda não tenha sido gravada. Isso pode gerar cobrança adicional. A persistência do Pi não transforma uma API externa em execução exatamente uma vez. As ferramentas desta implementação são consultas, declaradas seguras para repetição.

Para backup consistente, encerre o aplicativo e copie o diretório inteiro. Não edite os JSONL à mão. O conteúdo é local e não é criptografado por esta aplicação. Ao usar um provedor real, a visão de memória, mensagens e material a resumir são enviados a ele.

## Validação

```sh
npm run check    # tipos da aplicação e testes + testes automatizados
npm run build
npm run check:package   # instalação independente, CLI, API, tipos e arquivos da interface
```

Os testes cobrem partições e orçamento UTF-8, paginação sem perda, fila e deduplicação, isolamento das conversas de compactação, exclusão de raciocínio da memória, falha de compactação sem contexto incompleto, limite real da visão, HTTP local e bloqueio de outro escritor. Testes de integração **matam um processo com SIGKILL** durante a resposta e durante a compactação, reabrem os arquivos e comparam todas as mensagens do contexto reenviado, incluindo uma chamada de ferramenta já concluída.

Os testes usam provedores determinísticos. Sem credenciais, não se verificam qualidade dos resumos, latência real, acesso aos modelos ou economia de cache. O Pi registra uso e custo reportados pelo provider; a demonstração não representa custos reais.

## Decisões de implementação

Veja [ARCHITECTURE.md](./ARCHITECTURE.md) para o fluxo de tarefas, invariantes e diferenças deliberadas em relação ao gist. O Pi Durable é uma biblioteca recente: atualizações de versão devem passar novamente pelos testes de recuperação.
