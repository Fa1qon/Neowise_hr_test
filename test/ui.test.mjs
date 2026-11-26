import { test } from "node:test";
import assert from "node:assert/strict";
import { LOADING_VIEW, render, viewFor } from "../ui.mjs";

// Заглушки элементов страницы: render() трогает только textContent, value, hidden и dataset.
function fakeElements() {
  return {
    message: { textContent: "", dataset: {} },
    topic: { textContent: "" },
    draft: { value: "" },
    result: { hidden: true },
  };
}

function showReady(elements) {
  render(elements, viewFor(200, { status: "ready", topic: "pricing", draft: "Старый черновик" }));
  assert.equal(elements.draft.value, "Старый черновик");
  assert.equal(elements.result.hidden, false);
}

test("manual_review очищает предыдущий черновик и показывает сообщение для ручного разбора", () => {
  const elements = fakeElements();
  showReady(elements);

  render(elements, viewFor(200, { status: "manual_review", topic: null, draft: null }));

  assert.equal(elements.draft.value, "");
  assert.equal(elements.topic.textContent, "");
  assert.equal(elements.result.hidden, true);
  assert.equal(elements.message.dataset.state, "manual_review");
  assert.match(elements.message.textContent, /вручную/);
});

test("пока идёт новый разбор, старый черновик уже не виден", () => {
  const elements = fakeElements();
  showReady(elements);

  render(elements, LOADING_VIEW);

  assert.equal(elements.draft.value, "");
  assert.equal(elements.result.hidden, true);
});

test("ошибка сети или сервера тоже очищает черновик и предлагает ручной разбор", () => {
  for (const [status, body] of [[0, null], [500, { status: "server_error" }], [200, { foo: 1 }]]) {
    const elements = fakeElements();
    showReady(elements);
    render(elements, viewFor(status, body));
    assert.equal(elements.draft.value, "");
    assert.equal(elements.message.dataset.state, "error");
    assert.match(elements.message.textContent, /вручную/);
  }
});

test("пустой ввод: просим ввести текст", () => {
  const view = viewFor(400, { status: "invalid_input" });
  assert.equal(view.state, "invalid_input");
  assert.equal(view.draft, "");
});

test("успех: тема показывается по-русски", () => {
  const view = viewFor(200, { status: "ready", topic: "delivery", draft: "Привезём завтра." });
  assert.equal(view.topic, "Доставка");
  assert.equal(view.draft, "Привезём завтра.");
});
