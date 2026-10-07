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
