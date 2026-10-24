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

  if (
    typeof body.midiBase64 !== "string" ||
    !body.midiBase64.length
  ) {
    return json(400, {
      error: "Provide midiBase64 containing a base64-encoded MIDI file"
    });
  }

  try {
    const bytes = Buffer.from(body.midiBase64, "base64");

    if (
      bytes.length < 14 ||
      bytes.toString("ascii", 0, 4) !== "MThd"
    ) {
      return json(400, {
        error: "Invalid MIDI file. Expected a Standard MIDI File."
      });
    }

    const headerLength = bytes.readUInt32BE(4);
    const format = bytes.readUInt16BE(8);
    const trackCount = bytes.readUInt16BE(10);
    const division = bytes.readUInt16BE(12);

    if (division & 0x8000) {
      return json(400, {
        error: "SMPTE-timed MIDI is not supported yet."
      });
    }

    return json(200, {
      ok: true,
      format,
      trackCount,
      ticksPerBeat: division,
      midiBytes: bytes.length,
      message: "MIDI header validated successfully. Full note-event analysis is the next upgrade."
    });
  } catch {
    return json(400, {
      error: "Could not read the MIDI file."
    });
  }
};