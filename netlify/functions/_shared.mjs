export function methodError(event, method) {
  const actualMethod =
    event.httpMethod ||
    event.method ||
    event.request?.method;

  if (actualMethod === "OPTIONS") {
    return json(204, {});
  }

  if (actualMethod !== method) {
    return json(405, {
      error: `Expected ${method}, received ${actualMethod || "unknown method"}`
    });
  }

  return null;
}