const $ = (id) => document.getElementById(id);
const labels = {
  queued: "Na fila",
  preparing: "Preparando a memória",
  answering: "Respondendo",
  done: "Concluído",
  failed: "Interrompido",
  cancelled: "Cancelado",
};
let state,
  lastMessages = "",
  mode = "view",
  pending = false,
  refreshAgain = false;
let draftId = null;
async function api(path, data) {
  const result = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-OptChat": "1" },
          body: JSON.stringify(data),
        },
  );
  const value = await result.json();
  if (!result.ok) throw new Error(value.error || result.statusText);
  return value;
}
function text(tag, value, className) {
  const el = document.createElement(tag);
  el.textContent = value;
  if (className) el.className = className;
  return el;
}
function action(label, fn) {
  const button = text("button", label, "quiet");
  button.type = "button";
  button.onclick = () => Promise.resolve(fn()).catch(showError);
  return button;
}
function showError(error) {
  $("error").textContent = error.message || String(error);
}
function nodes(items) {
  $("tree").replaceChildren();
  $("detail").hidden = true;
  if (!items.length)
    $("tree").append(text("p", "A memória aparece aqui depois da primeira conversa.", "empty"));
  for (const item of items) {
    const button = text("button", "", "node");
    button.type = "button";
    button.append(text("span", item.address), text("p", item.text || item.snippet));
    button.onclick = () => openNode(item.address).catch(showError);
    $("tree").append(button);
  }
}
function memoryView() {
  mode = "view";
  nodes(
    (state?.memory.view || "").split("\n").flatMap((line) => {
      const match = line.match(/^(\d+\+\d+)\|(.*)$/);
      return match ? [{ address: match[1], text: match[2] }] : [];
    }),
  );
}
async function openNode(address, offset = 0, append = false) {
  mode = "zoom";
  const [start, count] = address.split("+").map(Number);
  const value = await api(`/api/zoom?start=${start}&count=${count}&offset=${offset}`);
  if (value.children) {
    nodes(value.children);
    return;
  }
  $("tree").replaceChildren();
  $("detail").hidden = false;
  if (!append) {
    $("detail").replaceChildren(
      text(
        "div",
        `${address} · registro Pi ${value.sourceEntry} · ${new Date(value.timestamp).toLocaleString("pt-BR")}`,
        "detail-title",
      ),
      text("pre", "", "original"),
    );
  }
  $("detail").querySelector("pre").textContent += value.text;
  $("detail").querySelector("button")?.remove();
  if (value.next !== null)
    $("detail").append(action("Ler próxima página", () => openNode(address, value.next, true)));
}
async function searchMemory(query, from = 0) {
  mode = "search";
  const result = await api(`/api/search?q=${encodeURIComponent(query)}&from=${from}`);
  nodes(result.matches);
  if (!result.matches.length)
    $("tree").replaceChildren(text("p", "Nenhuma ocorrência nesta página de registros.", "empty"));
  if (result.next !== null)
    $("tree").append(
      action("Buscar nos próximos registros", () => searchMemory(query, result.next)),
    );
}
function messages() {
  const requests = state.requests;
  const partial =
    state.live?.generation?.message?.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("") || "";
  const signature = JSON.stringify([requests, partial]);
  if (signature === lastMessages) return;
  lastMessages = signature;
  const scroll = $("messages").scrollTop;
  const follow = $("messages").scrollHeight - $("messages").clientHeight - scroll < 80;
  document.body.classList.toggle("has-history", requests.length > 0);
  $("messages").replaceChildren();
  for (const request of requests) {
    const turn = text("article", "", "turn");
    turn.append(
      text("p", "VOCÊ", "speaker"),
      text("div", request.text, "user-text"),
      text("p", "OPTCHAT", "speaker"),
    );
    const answer = request.answer || (request.status === "answering" ? partial : "");
    if (answer) turn.append(text("div", answer, "answer"));
    const status = text(
      "div",
      `${labels[request.status] || request.status}${request.frozenBytes !== null ? " · memória fixa de " + (request.frozenBytes / 1000).toFixed(1) + " KB" : ""}`,
      "turn-status",
    );
    if (["queued", "preparing", "answering"].includes(request.status))
      status.append(
        action("Cancelar", async () => {
          await api("/api/cancel", { requestId: request.id });
          await refresh();
        }),
      );
    if (request.error) turn.append(text("p", request.error, "error"));
    if (["failed", "cancelled"].includes(request.status))
      status.append(
        action("Tentar como nova mensagem", () => {
          $("prompt").value = request.text;
          $("prompt").focus();
        }),
      );
    turn.append(status);
    $("messages").append(turn);
  }
  $("messages").scrollTop = follow ? $("messages").scrollHeight : scroll;
}
async function refresh() {
  if (pending) {
    refreshAgain = true;
    return;
  }
  pending = true;
  try {
    state = await api("/api/state");
    $("connection").textContent = "● Local · conectado";
    $("demo").hidden = !state.demo;
    $("models").textContent =
      `Conversa: ${state.model.modelId} · Compactação: ${state.compactor.modelId}`;
    $("count").textContent = state.memory.messages;
    $("size").textContent = (state.memory.viewBytes / 1000).toFixed(1) + " KB";
    $("parts").textContent = state.memory.parts;
    $("tasks").textContent = state.tasks
      ? state.tasks + (state.tasks === 1 ? " tarefa" : " tarefas")
      : "Em dia";
    $("meter-fill").style.width =
      Math.min(100, (state.memory.viewBytes / state.memory.budget) * 100) + "%";
    $("memory-status").textContent =
      state.memory.error ||
      `${state.memory.summarized} de ${state.memory.messages} registros resumidos · limite ${(state.memory.budget / 1000).toFixed(0)} KB`;
    $("usage").textContent = JSON.stringify(state.usage, null, 2);
    messages();
    if (mode === "view") memoryView();
  } catch (error) {
    $("connection").textContent = "Reconectando…";
    showError(error);
  } finally {
    pending = false;
    if (refreshAgain) {
      refreshAgain = false;
      setTimeout(refresh, 150);
    }
  }
}
$("composer").onsubmit = async (event) => {
  event.preventDefault();
  const value = $("prompt").value;
  if (!value.trim()) return;
  if (!draftId || draftId.text !== value) draftId = { text: value, id: crypto.randomUUID() };
  $("send").disabled = true;
  $("error").textContent = "";
  try {
    await api("/api/messages", { text: value, requestId: draftId.id });
    $("prompt").value = "";
    draftId = null;
    await refresh();
  } catch (error) {
    showError(error);
  } finally {
    $("send").disabled = false;
  }
};
$("prompt").onkeydown = (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    $("composer").requestSubmit();
  }
};
$("reset-tree").onclick = memoryView;
$("search-form").onsubmit = (event) => {
  event.preventDefault();
  searchMemory($("search").value).catch(showError);
};
const events = new EventSource("/api/events");
events.onmessage = refresh;
events.onerror = () => {
  $("connection").textContent = "Reconectando…";
};
refresh();
