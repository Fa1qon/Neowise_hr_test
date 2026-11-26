import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.mjs";

const silentLog = { warn() {}, error() {} };
const MANUAL_REVIEW = { status: "manual_review", topic: null, draft: null };

async function startServer(options = {}) {
  const server = createApp({ log: silentLog, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}/api/triage` };
}

function postRaw(url, body) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
}

async function postJson(url, payload) {
  const reply = await postRaw(url, JSON.stringify(payload));
  return { status: reply.status, body: await reply.json() };
}

describe("POST /api/triage с имитатором модели", () => {
  let server;
  let url;
  before(async () => ({ server, url } = await startServer()));
  after(() => server.close());

  test("обычная заявка: тема и черновик", async () => {
    const { status, body } = await postJson(url, { text: "Когда будет доставка заказа?" });
    assert.equal(status, 200);
    assert.equal(body.status, "ready");
    assert.equal(body.topic, "delivery");
    assert.ok(body.draft.trim().length > 0);
  });

  for (const label of ["[timeout]", "[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"]) {
    test(`сбой модели ${label} → manual_review без темы и черновика`, async () => {
      const { status, body } = await postJson(url, { text: `Сколько стоит доставка? ${label}` });
      assert.equal(status, 200);
      assert.deepEqual(body, MANUAL_REVIEW);
    });
  }

  test("таймаут срабатывает примерно через 300 мс, а не через 1,2 с", async () => {
    const started = performance.now();
    const { body } = await postJson(url, { text: "заявка [timeout]" });
    const elapsed = performance.now() - started;
    assert.deepEqual(body, MANUAL_REVIEW);
    assert.ok(elapsed >= 250 && elapsed < 900, `ответ пришёл через ${Math.round(elapsed)} мс`);
  });

  const invalidBodies = {
    "пустая строка": JSON.stringify({ text: "" }),
    "только пробелы": JSON.stringify({ text: "   \n\t" }),
    "нет поля text": JSON.stringify({ message: "привет" }),
    "text — число": JSON.stringify({ text: 42 }),
    "text — null": JSON.stringify({ text: null }),
    "тело — null": "null",
    "тело — массив": JSON.stringify(["привет"]),
    "битый JSON": '{"text": "привет"',
    "пустое тело": "",
  };
  for (const [name, raw] of Object.entries(invalidBodies)) {
    test(`некорректный ввод (${name}) → 400 invalid_input`, async () => {
      const reply = await postRaw(url, raw);
      assert.equal(reply.status, 400);
      assert.deepEqual(await reply.json(), { status: "invalid_input" });
    });
  }
});

describe("POST /api/triage с подменённой моделью", () => {
  test("модель игнорирует сигнал отмены и молчит → всё равно manual_review за ~300 мс", async () => {
    const { server, url } = await startServer({ classify: () => new Promise(() => {}) });
    try {
      const started = performance.now();
      const { status, body } = await postJson(url, { text: "Сколько стоит?" });
      assert.equal(status, 200);
      assert.deepEqual(body, MANUAL_REVIEW);
      assert.ok(performance.now() - started < 900);
    } finally {
      server.close();
    }
  });

  test("модель вернула не строку → manual_review", async () => {
    const { server, url } = await startServer({ classify: async () => ({ topic: "other", draft: "ок" }) });
    try {
      assert.deepEqual((await postJson(url, { text: "привет" })).body, MANUAL_REVIEW);
    } finally {
      server.close();
    }
  });

  test("модель вернула draft не строкой → manual_review", async () => {
    const { server, url } = await startServer({
      classify: async () => JSON.stringify({ topic: "other", draft: 123 }),
    });
    try {
      assert.deepEqual((await postJson(url, { text: "привет" })).body, MANUAL_REVIEW);
    } finally {
      server.close();
    }
  });
});
