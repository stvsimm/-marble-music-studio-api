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
function readVlq(bytes, state) {
  let value = 0;
  for (let count = 0; count < 4; count++) {
    if (state.pos >= state.end) {
      throw new Error("Unexpected end of MIDI data.");
    }
    const byte = bytes[state.pos++];
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  throw new Error("Invalid MIDI variable-length quantity.");
}
function parseMidi(bytes) {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );
  const text = (start, length) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes.length < 14 || text(0, 4) !== "MThd") {
    throw new Error("Invalid Standard MIDI File.");
  }
  const headerLength = view.getUint32(4);
  const format = view.getUint16(8);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if (headerLength < 6 || 8 + headerLength > bytes.length) {
    throw new Error("Invalid MIDI header.");
  }
  if (division & 0x8000) {
    throw new Error("SMPTE-timed MIDI is not supported yet.");
  }
  if (!division) {
    throw new Error("MIDI ticks per beat cannot be zero.");
  }
  let pos = 8 + headerLength;
  const allNotes = [];
  const tempos = [{ tick: 0, micros: 500000 }];
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (pos + 8 > bytes.length || text(pos, 4) !== "MTrk") {
      throw new Error("MIDI track header missing.");
    }
    const trackLength = view.getUint32(pos + 4);
    const start = pos + 8;
    const end = start + trackLength;
    if (end > bytes.length) {
      throw new Error("MIDI track exceeds file length.");
    }
    const state = { pos: start, end };
    let tick = 0;
    let runningStatus = 0;
    const active = new Map();
    while (state.pos < end) {
      tick += readVlq(bytes, state);
      if (state.pos >= end) break;
      let status = bytes[state.pos];
      if (status & 0x80) {
        state.pos++;
        if (status < 0xf0) {
          runningStatus = status;
        }
      } else {
        if (!runningStatus) {
          throw new Error("Invalid MIDI running status.");
        }
        status = runningStatus;
      }
      if (status === 0xff) {
        if (state.pos >= end) {
          throw new Error("Invalid MIDI meta event.");
        }
        const type = bytes[state.pos++];
        const length = readVlq(bytes, state);
        if (state.pos + length > end) {
          throw new Error("Invalid MIDI meta event length.");
        }
        if (type === 0x51 && length === 3) {
          const micros =
            (bytes[state.pos] << 16) |
            (bytes[state.pos + 1] << 8) |
            bytes[state.pos + 2];
          if (micros > 0) tempos.push({ tick, micros });
        }
        state.pos += length;
        if (type === 0x2f) break;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const length = readVlq(bytes, state);
        state.pos += length;
        if (state.pos > end) {
          throw new Error("Invalid MIDI system-exclusive event.");
        }
        runningStatus = 0;
        continue;
      }
      if (status >= 0xf0) {
        const length =
          status === 0xf2 ? 2 :
          status === 0xf1 || status === 0xf3 ? 1 : 0;
        state.pos += length;
        if (state.pos > end) {
          throw new Error("Invalid MIDI system event.");
        }
        runningStatus = 0;
        continue;
      }
      const command = status & 0xf0;
      const channel = status & 0x0f;
      const dataBytes =
        command === 0xc0 || command === 0xd0 ? 1 : 2;
      if (state.pos + dataBytes > end) {
        throw new Error("Truncated MIDI channel event.");
      }
      const pitch = bytes[state.pos++];
      const value = dataBytes === 2 ? bytes[state.pos++] : 0;
      if (pitch > 127 || value > 127) {
        throw new Error("Invalid MIDI data byte.");
      }
      if (command === 0x90 && value > 0) {
        const key = `${channel}:${pitch}`;
        if (!active.has(key)) active.set(key, []);
        active.get(key).push({
          pitch,
          velocity: value,
          channel,
          track: trackIndex,
          startTick: tick
        });
      } else if (
        command === 0x80 ||
        (command === 0x90 && value === 0)
      ) {
        const key = `${channel}:${pitch}`;
        const queue = active.get(key);
        if (queue && queue.length) {
          const note = queue.shift();
          allNotes.push({
            ...note,
            endTick: tick
          });
        }
      }
    }
    // Close any notes that never received a note-off.
    for (const queue of active.values()) {
      for (const note of queue) {
        allNotes.push({ ...note, endTick: tick });
      }
    }
    pos = end;
  }
  tempos.sort((a, b) => a.tick - b.tick);
  const uniqueTempos = [];
  for (const tempo of tempos) {
    if (
      uniqueTempos.length &&
      uniqueTempos[uniqueTempos.length - 1].tick === tempo.tick
    ) {
      uniqueTempos[uniqueTempos.length - 1] = tempo;
    } else {
      uniqueTempos.push(tempo);
    }
  }
  function tickToSeconds(targetTick) {
    let seconds = 0;
    let previousTick = 0;
    let micros = 500000;
    for (const tempo of uniqueTempos) {
      if (tempo.tick > targetTick) break;
      seconds +=
        ((tempo.tick - previousTick) * micros) /
        (division * 1000000);
      previousTick = tempo.tick;
      micros = tempo.micros;
    }
    seconds +=
      ((targetTick - previousTick) * micros) /
      (division * 1000000);
    return seconds;
  }
  const notes = allNotes
    .map(note => {
      const startSeconds = tickToSeconds(note.startTick);
      const endSeconds = tickToSeconds(note.endTick);
      return {
        pitch: note.pitch,
        velocity: note.velocity,
        channel: note.channel,
        track: note.track,
        startSeconds,
        durationSeconds: Math.max(0, endSeconds - startSeconds)
      };
    })
    .sort((a, b) => a.startSeconds - b.startSeconds);
  return {
    format,
    trackCount,
    ticksPerBeat: division,
    noteCount: notes.length,
    durationSeconds: notes.reduce(
      (max, note) =>
        Math.max(max, note.startSeconds + note.durationSeconds),
      0
    ),
    notes
  };
}
export default async function(request) {
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
    return json({ error: "Expected POST request." }, 405);
  }
  const expectedKey = process.env.MMS_API_KEY;
  if (
    expectedKey &&
    request.headers.get("x-api-key") !== expectedKey
  ) {
    return json({ error: "Missing or invalid API key." }, 401);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  if (
    typeof body?.midiBase64 !== "string" ||
    !body.midiBase64.length
  ) {
    return json({
      error: "Provide midiBase64 containing a Base64-encoded MIDI file."
    }, 400);
  }
  try {
    const encoded = body.midiBase64.replace(/\s/g, "");
    if (
      encoded.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
    ) {
      return json({ error: "Invalid Base64 encoding." }, 400);
    }
    const bytes = Buffer.from(encoded, "base64");
    const analysis = parseMidi(bytes);
    const marbleEvents = analysis.notes.slice(0, 10000).map(note => ({
      pitch: note.pitch,
      startSeconds: note.startSeconds,
      durationSeconds: note.durationSeconds,
      velocity: note.velocity,
      track: note.track
    }));
    return json({
      ok: true,
      ...analysis,
      marbleEvents,
      message: "MIDI notes extracted successfully."
    });
  } catch (error) {
    return json({
      error: error.message || "Could not analyze MIDI file."
    }, 400);
  }
}