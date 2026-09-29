// records.js
// ============================================================
// Лучший забег игрока — хранится в localStorage, переживает
// перезагрузку страницы. Храним только ОДИН, самый глубокий забег.
// ============================================================

const STORAGE_KEY = "dybenko-best-run";

/** Вернуть сохранённый рекорд или null, если забегов ещё не было. */
export function getBestRecord() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Сохранить итоги забега, если он побил текущий рекорд (по глубине).
 * Возвращает { record, isNewRecord } — record всегда актуальный лучший результат.
 */
export function saveRunIfRecord(run) {
  const current = getBestRecord();
  const isNewRecord = !current || run.depth > current.depth;

  if (isNewRecord) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
    } catch {
      // localStorage недоступен (приватный режим и т.п.) — просто не сохраняем.
    }
  }

  return { record: isNewRecord ? run : current, isNewRecord };
}