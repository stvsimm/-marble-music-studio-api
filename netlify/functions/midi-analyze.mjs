import {
  json,
  methodError,
  authError,
  parseBody
} from "./_shared.mjs";

function readVlq(bytes, state) {
  let value = 0;
  let count = 0;

  while (state.pos < bytes.length && count < 4) {
    const byte = bytes[state.pos++];
    value = (value << 7) | (byte & 0x7f);
    count++;

    if (!(byte & 0x80)) return value;
  }

  throw new Error("Invalid MIDI variable-length quantity.");
}

function parseMidi(bytes) {
  const text = (start, length) =>
    String.fromCharCode(...bytes.subarray(start, start + length));

  if (bytes.length < 14 || text(0, 4) !== "MThd") {
    throw new Error("Invalid Standard MIDI File.");
  }

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );

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

  if (division === 0) {
    throw new Error("MIDI ticks per beat cannot be zero.");
  }

  let pos = 8 + headerLength;
  const tracks = [];
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

    const state = { pos: start };
    let tick = 0;
    let runningStatus = 0;
    const active = new Map();
    const notes = [];

    while (state.pos < end) {
      tick += readVlq(bytes, state);

      if (state.pos >= end) break;

      let status = bytes[state.pos];

      if (status & 0x80) {
        state.pos++;
        if (status < 0xf0) runningStatus = status;
      } else {
        if (!runningStatus) {
          throw new Error("Invalid MIDI running status.");
        }
        status = runningStatus;
      }

      if (status === 0xff) {
        const type = bytes[state.pos++];
        const length = readVlq(bytes, state);

        if (state.pos + length > end) {
          throw new Error("Invalid MIDI meta event.");
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
        continue;
      }

      if (status >= 0xf0) {
        const length = status === 0xf2 ? 2 :
          status === 0xf1 || status === 0xf3 ? 1 : 0;
        state.pos += length;
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      const pitch = bytes[state.pos++];

      if (
        command === 0xc0 ||
        command === 0xd0
      ) {
        // These MIDI messages have only one data byte.
        continue;
      }

      if (state.pos >= end) {
        throw new Error("Truncated MIDI channel event.");
      }

      const velocity = bytes[state.pos++];

      if (pitch > 127 || velocity > 127) {
        throw new Error("Invalid MIDI data byte.");
      }

      if (command === 0x90 && velocity > 0) {
        const key = `${channel}:${pitch}`;
        if (!active.has(key)) active.set(key, []);

        active.get(key).push({
          pitch,
          velocity,
          channel,
          track: trackIndex,
          startTick: tick
        });
      } else if (
        command === 0x80 ||
        (command === 0x90 && velocity === 0)
      ) {
        const key = `${channel}:${pitch}`;
        const queue = active.get(key);

        if (queue && queue.length) {
          const note = queue.shift();

          notes.push({
            ...note,
            endTick: tick
          });
        }
      }
    }

    tracks.push(notes);
    pos = end;
  }

  const allNotes = tracks.flat();

  // Sort tempo changes and remove duplicate-tick entries.
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

  const notes = allNotes.map(note => {
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
  }).sort((a, b) => a.startSeconds - b.startSeconds);

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

export default async event => {
  const method = methodError(event, "POST");
  if (method) return method;

  const auth = authError(event);
  if (auth) return auth;

  const body = parseBody(event);

  if (!body) {
    return json(400, { error: "Request body must be valid JSON." });
  }

  if (
    typeof body.midiBase64 !== "string" ||
    !body.midiBase64.length
  ) {
    return json(400, {
      error: "Provide midiBase64 containing a Base64-encoded MIDI file."
    });
  }

  try {
    const encoded = body.midiBase64.replace(/\s/g, "");

    if (
      encoded.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
    ) {
      return json(400, { error: "Invalid base64 encoding." });
    }

    const bytes = Buffer.from(encoded, "base64");
    const analysis = parseMidi(bytes);

    // Generate a capped sample for the marble endpoint.
    const marbleEvents = analysis.notes.slice(0, 10000).map(note => ({
      pitch: note.pitch,
      startSeconds: note.startSeconds,
      durationSeconds: note.durationSeconds,
      velocity: note.velocity,
      track: note.track
    }));

    return json(200, {
      ok: true,
      ...analysis,
      marbleEvents,
      message: "MIDI notes extracted successfully."
    });
  } catch (error) {
    return json(400, {
      error: error.message || "Could not analyze MIDI file."
    });
  }
};