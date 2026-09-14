type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function formatDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (!isRecord(item) || typeof item.msg !== "string") return null;

        const location = Array.isArray(item.loc)
          ? item.loc.filter((part) => typeof part === "string").join(".")
          : "";
        return location ? `${location}: ${item.msg}` : item.msg;
      })
      .filter((message): message is string => Boolean(message));
    return messages.length ? messages.join("; ") : null;
  }

  if (isRecord(detail)) {
    if (typeof detail.message === "string" && detail.message.trim()) {
      return detail.message;
    }
    if (typeof detail.msg === "string" && detail.msg.trim()) return detail.msg;
  }

  return null;
}

/**
 * Converts API error payloads into text that is safe to render in React.
 * FastAPI validation errors use an array of objects in `detail`, which cannot
 * be passed directly to a toast or JSX child.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const detail = isRecord(error) && isRecord(error.response) && isRecord(error.response.data)
    ? error.response.data.detail
    : undefined;

  return formatDetail(detail) || fallback;
}
