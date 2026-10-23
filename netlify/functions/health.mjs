export default async () => {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ok: true,
      service: "Marble Music Studio API",
      version: "0.1.0",
      message: "API is online!",
      endpoints: [
        "/api/health",
        "/api/midi/analyze",
        "/api/marbles/generate"
      ]
    })
  };
};