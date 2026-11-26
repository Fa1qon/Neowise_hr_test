// Разбор заявки: проверка ввода, вызов модели с ограничением времени и проверка её ответа.
// Модуль не знает про HTTP, поэтому его легко тестировать отдельно от сервера.

export const TOPICS = ["delivery", "pricing", "other"];
export const MODEL_TIMEOUT_MS = 300;

const manualReview = () => ({ status: "manual_review", topic: null, draft: null });

/** Возвращает текст заявки или null, если ввод некорректен. */
export function parseInput(rawBody) {
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const { text } = body;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Проверяет сырой ответ модели. Статус 200 и валидный JSON ещё не значат, что результат годный:
 * тема должна быть из списка, черновик — непустой строкой.
 */
export function validateModelOutput(raw) {
  if (typeof raw !== "string") return { ok: false, reason: "not_a_string" };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "not_an_object" };
  }
  if (!TOPICS.includes(parsed.topic)) return { ok: false, reason: "bad_topic" };
  if (typeof parsed.draft !== "string" || parsed.draft.trim() === "") {
    return { ok: false, reason: "empty_draft" };
  }
  return { ok: true, topic: parsed.topic, draft: parsed.draft.trim() };
}

class ModelTimeoutError extends Error {
  name = "ModelTimeoutError";
}

/**
 * Ждёт модель не дольше timeoutMs. Сигнал отмены передаётся модели, а гонка с таймером
 * защищает на случай, если модель сигнал проигнорирует.
 */
export async function callModel(classify, text, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new ModelTimeoutError(`model did not answer in ${timeoutMs} ms`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([classify(text, { signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Полный разбор заявки: всегда возвращает либо ready, либо manual_review. */
export async function triage(text, { classify, timeoutMs = MODEL_TIMEOUT_MS, log = console } = {}) {
  let raw;
  try {
    raw = await callModel(classify, text, timeoutMs);
  } catch (error) {
    // Текст заявки в лог не пишем: в нём могут быть персональные данные клиента.
    const reason = error instanceof ModelTimeoutError ? "timeout" : "model_error";
    log.warn(`[triage] manual_review: ${reason}`);
    return manualReview();
  }

  const checked = validateModelOutput(raw);
  if (!checked.ok) {
    log.warn(`[triage] manual_review: ${checked.reason}`);
    return manualReview();
  }
  return { status: "ready", topic: checked.topic, draft: checked.draft };
}
