/**
 * Генерация идентификаторов для моковой БД.
 * crypto.randomUUID доступен в браузерах Chrome 131+/Safari 18+ и в Node 19+.
 */
export function createId(prefix: string): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  const unique =
    typeof randomUUID === 'function'
      ? randomUUID.call(globalThis.crypto)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${unique}`;
}

/** Стабильный слаг для аудитории: "3-201" -> "room-3-201". */
export function auditoriumIdFromNumber(roomNumber: string): string {
  const slug = roomNumber
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return slug ? `room-${slug}` : createId('room');
}
