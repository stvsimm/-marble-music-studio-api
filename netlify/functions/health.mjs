export default async (request) => {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "Midi Marble API",
      version: "0.1.0",
      message: "API is online!",
      endpoints: [
        "/api/health",
        "/api/midi/analyze",
        "/api/marbles/generate"
      ]
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*"
      }
    }
  );
};