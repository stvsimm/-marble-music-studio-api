import {
  json,
  methodError,
  authError,
  parseBody
} from "./_shared.mjs";

export default async (event) => {
  const method = methodError(event, "POST");
  if (method) return method;

  const auth = authError(event);
  if (auth) return auth;

  const body = parseBody(event);

  if (!body) {
    return json(400, {
      error: "Request body must be valid JSON"
    });
  }

  if (!Array.isArray(body.notes)) {
    return json(400, {
      error: "Provide a notes array from your MIDI analysis"
    });
  }

  const maxNotes = 10000;

  if (body.notes.length > maxNotes) {
    return json(413, {
      error: `Too many notes. Maximum: ${maxNotes}`
    });
  }

  const marbles = body.notes.map((note, index) => {
    const pitch = Number(note.pitch);
    const start = Number(note.start);
    const duration = Number(note.duration);
    const velocity = Number(note.velocity ?? 100);

    if (
      !Number.isFinite(pitch) ||
      !Number.isFinite(start) ||
      !Number.isFinite(duration) ||
      !Number.isFinite(velocity) ||
      pitch < 0 ||
      pitch > 127 ||
      start < 0 ||
      duration <= 0 ||
      velocity < 0 ||
      velocity > 127
    ) {
      return null;
    }

    return {
      id: index + 1,
      pitch,
      start,
      duration,
      velocity,
      // Higher MIDI pitches are placed higher in the scene.
      height: Math.round((pitch / 127) * 1000) / 1000,
      // MIDI pitch is mapped to a simple visual lane.
      lane: pitch % 8,
      // Velocity controls the suggested marble size.
      radius: Math.round((0.15 + velocity / 127 * 0.35) * 1000) / 1000
    };
  });

  if (marbles.some((marble) => marble === null)) {
    return json(400, {
      error: "Each note needs valid pitch, start, duration, and optional velocity values."
    });
  }

  return json(200, {
    ok: true,
    count: marbles.length,
    units: {
      start: "seconds",
      duration: "seconds",
      pitch: "MIDI note number"
    },
    marbles,
    message: "Marble scene data generated. This endpoint creates scene data, not a rendered 3D video yet."
  });
};