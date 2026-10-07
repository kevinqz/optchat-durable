# Validação executada em 07/10/2026

Ambiente: macOS, Node.js 22.23.1, npm 11.5.2. Pi AI, Pi Durable e Chord: 1.0.4.

- `npm run check`: tipos da aplicação e testes aprovados; **16 testes passaram**, sem falhas ou testes pulados.
- `npm run build`: aprovado.
- `node --check web/app.js`: aprovado após o ajuste de navegação da conversa.
- A versão compilada foi iniciada com `npm start -- --demo`. Pela interface foram verificados envio, conclusão, crescimento da memória, zoom do texto original, busca literal e preservação da conversa após reiniciar o servidor.
- Os testes de recuperação encerraram processos reais com `SIGKILL` durante uma resposta após uma ferramenta e durante uma chamada do compactador. O contexto normalizado retomado foi comparado ao anterior; entradas do usuário e resultados de ferramenta não se duplicaram. A abertura simultânea do mesmo armazenamento foi rejeitada.
- Testes adicionais verificaram fila de 35 mensagens, orçamento de 4.096 bytes, cancelamento seguido de nova mensagem, concorrência limitada, cinco tentativas de tamanho e preservação do contexto detalhado do compactador.

Os provedores usados nos testes foram determinísticos e a interface está em demonstração explícita. **Não houve teste de inferência com OpenAI ou Anthropic**, pois nenhuma chave foi fornecida. Qualidade dos resumos, latência real, acesso da conta aos modelos e eficácia do cache permanecem sem validação com um provedor real. Os testes de processo não simulam falha elétrica, disco defeituoso ou filesystem de rede.

Para reproduzir: `npm ci`, `npm run check`, `npm run build` e `npm run demo`. Os testes HTTP precisam poder escutar em loopback. No ambiente sandbox deste trabalho, essa etapa foi executada com a permissão correspondente.

A extensão pública foi verificada em um harness pertencente a outro aplicativo, com duas conversas OptChat simultâneas e uma conversa independente. Os IDs de pedido e a recuperação de memória ficaram isolados por conversa. A compilação agora inclui declarações TypeScript portáteis.

`npm run check:package` passou: o tarball foi instalado em um projeto temporário vazio, sem executar scripts de instalação. Foram aprovados o executável CLI, envio em demonstração, reabertura persistente, zoom no original, extensão no host de exemplo, entrega dos três arquivos da interface por HTTP e compilação de um consumidor TypeScript separado. A lista do pacote contém somente arquivos públicos permitidos; `.env`, históricos e `node_modules` não são distribuídos. A primeira consulta ao npm expirou ao buscar metadados do TypeScript; a repetição com preferência pelo cache completou todos os testes.

A [primeira execução pública de CI](https://github.com/kevinqz/optchat-durable/actions/runs/37687478258), no commit `1fae858c4901b0aa55b9dd9ac6b874c9585a9c4b`, passou nas quatro combinações: Ubuntu e macOS, com Node 22.19.0 e Node 24. Cada combinação executou a suíte de 16 testes e a instalação independente do pacote, incluindo consumo TypeScript e interface HTTP. Isso qualifica essas plataformas e versões para os comportamentos determinísticos testados, não a qualidade de inferência dos provedores reais.


## Versão 0.2.0: autoria e integração nativa

- `npm run check`: **19 testes passaram** no macOS com Node 22.23.1; sem falhas ou testes pulados.
- A nova composição executou uma ferramenta do hospedeiro, preservou suas instruções, seções, diretório e nível de raciocínio e manteve o compactador sem essas ferramentas e instruções.
- `prompt()` reutilizou o mesmo pedido sem repetir a execução da ferramenta. A suíte existente voltou a verificar recuperação após SIGKILL na geração e na compactação.
- A migração reconheceu o prompt padrão 0.1, manteve o texto original recuperável e conservou instruções personalizadas em outro teste. A exclusão explícita de ferramentas obrigatórias foi rejeitada antes de iniciar a geração principal.
- `CITATION.cff` passou na validação contra o schema oficial CFF 1.2.0. Está escrito no subconjunto JSON de YAML 1.2; a checagem do pacote também valida a correspondência das versões e a presença dos créditos a Victor Taelin e Mario Zechner.
- A verificação do pacote exige `CREDITS.md`, `CITATION.cff`, `NOTICE`, `LICENSE` e `THIRD_PARTY_NOTICES.md`, e executa o comando `credits` no pacote instalado.

As limitações de inferência real permanecem as mesmas. Não foi qualificada uma atualização entre versões durante uma chamada de provedor em andamento; atualize com a fila e a memória estabilizadas.

O `npm run check:package` da versão 0.2 passou em um projeto temporário vazio: CLI, comando de créditos, reabertura persistente, exemplo de hospedeiro, arquivos HTTP da interface e consumidor TypeScript. O tarball inclui 87 arquivos permitidos e exclui dados privados.
