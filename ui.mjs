// Логика страницы без привязки к DOM: что показать менеджеру по ответу API.
// render() работает с любыми объектами со свойствами textContent/value/hidden,
// поэтому её можно проверить в Node без браузера.

export const TOPIC_LABELS = {
  delivery: "Доставка",
  pricing: "Цена и стоимость",
  other: "Другое",
};

const EMPTY = { topic: "", draft: "" };

export const LOADING_VIEW = { state: "loading", ...EMPTY, message: "Разбираем заявку…" };

export function viewFor(httpStatus, body) {
  if (
    httpStatus === 200 &&
    body?.status === "ready" &&
    Object.hasOwn(TOPIC_LABELS, body.topic) &&
    typeof body.draft === "string" &&
    body.draft.trim() !== ""
  ) {
    return {
      state: "ready",
      topic: TOPIC_LABELS[body.topic],
      draft: body.draft,
      message: "Проверьте черновик перед отправкой клиенту.",
    };
  }
  if (httpStatus === 200 && body?.status === "manual_review") {
    return {
      state: "manual_review",
      ...EMPTY,
      message: "AI не смог подготовить ответ. Разберите заявку вручную: определите тему и напишите ответ сами.",
    };
  }
  if (httpStatus === 400 && body?.status === "invalid_input") {
    return { state: "invalid_input", ...EMPTY, message: "Введите текст заявки." };
  }
  return {
    state: "error",
    ...EMPTY,
    message: "Сервис временно недоступен. Разберите заявку вручную или попробуйте позже.",
  };
}

/** Перерисовывает результат целиком: прошлые тема и черновик никогда не остаются на экране. */
export function render(elements, view) {
  elements.message.textContent = view.message;
  elements.message.dataset.state = view.state;
  elements.topic.textContent = view.topic;
  elements.draft.value = view.draft;
  elements.result.hidden = view.state !== "ready";
}
