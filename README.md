# Marble Music Studio API — Netlify starter

A prototype API package for a **new Netlify site**. It does not modify your existing MIDI Reader site.

## Included endpoints
- `GET /api/health`
- `POST /api/midi/analyze` — parses a Standard MIDI File supplied as base64.
- `POST /api/marbles/generate` — maps note events to timed marble/geometry data.

This is an API prototype, not a 3D renderer. It does not yet include user accounts, individual API keys, metering, or payments.

## Deployment path
**Important:** Drag-and-drop static deployment alone will not deploy Netlify Functions. Use a GitHub repository connected to Netlify:

1. Create a new GitHub repository.
2. Upload the contents of this ZIP into the repository root (upload the files/folders, not the ZIP itself).
3. In Netlify, choose **Add new site → Import an existing project** and connect that repository.
4. Use build command `npm run build`, publish directory `public`; `netlify.toml` sets the Functions directory.
5. Deploy, then open `/api/health` on the new site's domain.

## Test the marble endpoint
POST JSON to `/api/marbles/generate`:
```json
{"notes":[{"time":0,"duration":0.4,"pitch":60,"velocity":100},{"time":0.5,"duration":0.3,"pitch":64,"velocity":85}]}
```

## Test MIDI analysis
POST JSON to `/api/midi/analyze`:
```json
{"midiBase64":"BASE64_ENCODED_STANDARD_MIDI_FILE"}
```
The response includes track count, duration, and note events.

## Optional shared test key
Set Netlify environment variable `MMS_API_KEY` to a long random value. POST requests then require header `x-api-key` with that value. If unset, POST endpoints are open for prototyping. Do not expose this secret in frontend code.

This is only one shared prototype key, not per-customer keys. Before charging users, add customer-specific key management, usage metering/limits, abuse protection, and payment integration. Review current Netlify plan limits before launch.
