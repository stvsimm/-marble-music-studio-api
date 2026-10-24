function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-api-key",
      "access-control-allow-methods": "POST, OPTIONS"
    }
  });
}

export default async function (request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, x-api-key",
        "access-control-allow-methods": "POST, OPTIONS"
      }
    });
  }

  if (request.method !== "POST") {
    return json({
      error: "Use POST with a JSON body."
    }, 405);
  }

  try {
    const body = await request.json();

    const notes = body.notes;

    if (!Array.isArray(notes) || notes.length === 0) {
      return json({
        error: "Provide a non-empty notes array."
      }, 400);
    }

    if (notes.length > 5000) {
      return json({
        error: "Maximum 5000 notes per request."
      }, 400);
    }

    const events = [];

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];

      if (
        !Number.isFinite(note.pitch) ||
        note.pitch < 0 ||
        note.pitch > 127 ||
        !Number.isFinite(note.startSeconds) ||
        note.startSeconds < 0 ||
        !Number.isFinite(note.durationSeconds) ||
        note.durationSeconds <= 0
      ) {
        return json({
          error: `Invalid note at index ${i}. Each note needs pitch (0–127), startSeconds (>= 0), and durationSeconds (> 0).`
        }, 400);
      }

      events.push({
        eventId: i + 1,
        pitch: note.pitch,
        startSeconds: note.startSeconds,
        durationSeconds: note.durationSeconds,
        velocity: Number.isFinite(note.velocity)
          ? Math.max(0, Math.min(127, note.velocity))
          : 100,
        marbleRadius: 0.08 + (note.pitch / 127) * 0.12,
        impactStrength: Math.max(
          0.1,
          Math.min(1, (Number.isFinite(note.velocity) ? note.velocity : 100) / 127)
        ),
        track: Number.isInteger(note.track) && note.track >= 0
          ? note.track
          : 0
      });
    }

    events.sort((a, b) => a.startSeconds - b.startSeconds);

    return json({
      ok: true,
      eventCount: events.length,
      durationSeconds: Math.max(
        ...events.map(e => e.startSeconds + e.durationSeconds)
      ),
      events,
      message: "Marble event data generated. 3D rendering is not implemented yet."
    });
  } catch {
    return json({
      error: "Request body must be valid JSON."
    }, 400);
  }
}