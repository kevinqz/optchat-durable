# Local HTTP API

[Documentation index](../README.md) · [Standalone application](../guides/standalone.md)

`serve(app, port = 4317)` starts the standalone UI server and returns `{ url, close() }`. It does not own `app`; close the server and then the application. This is the local UI's interface, not an authenticated public service or a separately versioned remote API.

## Requests

The server binds to `127.0.0.1`. `Host` must be `127.0.0.1:<port>` or `localhost:<port>`; an `Origin` header, when present, must match that host exactly. Every POST requires `Content-Type: application/json` and `X-OptChat: 1`. Bodies must be JSON objects and fit the configured request limit.

| Method and path             | Parameters / body                       | Result                                                                               |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /`                     | None                                    | Packaged UI                                                                          |
| `GET /app.js`, `/style.css` | None                                    | Packaged assets; other filesystem paths are not served                               |
| `GET /api/state`            | None                                    | Memory, recent requests, live generation state, model references and usage           |
| `GET /api/zoom`             | `start`, `count`, optional `offset`     | Child summaries, or original text with byte pagination                               |
| `GET /api/search`           | `q`, optional `from`                    | Literal matches and next scan index                                                  |
| `GET /api/events`           | None                                    | Server-sent `ready` / `changed` notifications; refetch state after each notification |
| `POST /api/messages`        | `{ "text": "...", "requestId": "..." }` | HTTP 202 with durable `requestId` and `taskId`                                       |
| `POST /api/cancel`          | `{ "requestId": "..." }`                | Cancellation result; the original request record remains                             |

Admission is not completion. A successful message POST only confirms queueing; inspect the corresponding request's status and answer in `/api/state`. IDs are conversation-scoped, 1–128 ASCII word characters, colons or hyphens. Reusing the same ID/text returns the existing task; a different text under that ID is rejected. Completed/failed IDs are not reset by re-submitting them.

`zoom` uses aligned binary `start+count` intervals. `count=1` opens original normalized text; follow `next` with `offset` until null. Search is case-insensitive literal matching, not semantic search; follow `next` with `from` until null. A search scans at most 250 records and returns at most 20 matches per page. Dates are included in original retrieval; there is no standalone `/api/date` route.

## Errors and events

- Invalid input and application errors return HTTP 400 with `{ "error": "..." }`.
- Foreign Host/Origin and missing mutation headers return 403.
- Unknown routes return 404; unsupported methods return 405.
- Event listeners are limited to 16 concurrent connections; excess listeners receive 429.

Events are change notifications, not a complete token or audit stream. They can be grouped; state remains authoritative. The UI displays the latest 50 request receipts, while the memory index retains older originals. Memory reads may update indexes but do not themselves enable model scheduling. A server opened in its default execution mode may already have background work running.

The browser receives conversation state and provider-reported usage, not provider credentials. Content is rendered as text, not message-supplied HTML. The server sets a restrictive content security policy, disables caching, and does not enable cross-origin access. None of these controls replaces multi-user authentication. See [security](../../SECURITY.md).
