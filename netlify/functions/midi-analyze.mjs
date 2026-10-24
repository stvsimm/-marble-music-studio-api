function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
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
    return json({ error: "Use POST with a JSON body." }, 405);
  }

  try {
    const body = await request.json();

    if (
      typeof body.midiBase64 !== "string" ||
      !body.midiBase64.length
    ) {
      return json({
        error: "Provide midiBase64 containing a base64-encoded MIDI file."
      }, 400);
    }

    const encoded = body.midiBase64.replace(/\s/g, "");

    if (
      encoded.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
    ) {
      return json({ error: "Invalid base64 encoding." }, 400);
    }

    const bytes = Buffer.from(encoded, "base64");

    if (
      bytes.length < 14 ||
      bytes.toString("ascii", 0, 4) !== "MThd"
    ) {
      return json({
        error: "Invalid MIDI file. Expected a Standard MIDI File."
      }, 400);
    }

    const headerLength = bytes.readUInt32BE(4);

    if (headerLength < 6 || bytes.length < 8 + headerLength) {
      return json({ error: "Invalid MIDI header." }, 400);
    }

    const format = bytes.readUInt16BE(8);
    const trackCount = bytes.readUInt16BE(10);
    const division = bytes.readUInt16BE(12);

    if (format > 2 || trackCount === 0) {
      return json({ error: "Unsupported MIDI format or empty track list." }, 400);
    }

    if (division & 0x8000) {
      return json({
        error: "SMPTE-timed MIDI is not supported yet."
      }, 400);
    }

    return json({
      ok: true,
      format,
      trackCount,
      ticksPerBeat: division,
      midiBytes: bytes.length,
      noteAnalysis: "Not implemented yet",
      message: "MIDI header validated successfully."
    });
  } catch {
    return json({
      error: "Could not read the request. Send valid JSON containing midiBase64."
    }, 400);
  }
}