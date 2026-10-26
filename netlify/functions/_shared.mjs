export function json(statusCode, data) {
  return new Response(
    statusCode === 204 ? null : JSON.stringify(data),
    {
      status: statusCode,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, x-api-key",
        "access-control-allow-methods": "GET, POST, OPTIONS"
      }
    }
  );
}

export function methodError(event, method) {
  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  if (event.httpMethod !== method) {
    return json(405, { error: `Use ${method}` });
  }

  return null;
}

export function authError(event) {
  const expected = process.env.MMS_API_KEY;

  if (!expected) return null;

  const supplied =
    event.headers?.["x-api-key"] ||
    event.headers?.["X-Api-Key"];

  if (supplied !== expected) {
    return json(401, { error: "Missing or invalid API key" });
  }

  return null;
}

export function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return null;
  }
}