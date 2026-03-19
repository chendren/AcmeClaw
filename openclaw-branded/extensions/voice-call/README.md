# @openclaw/voice-call

Official Voice Call plugin for **OpenClaw**.

Providers:

- **Twilio** (Programmable Voice + Media Streams)
- **Telnyx** (Call Control v2)
- **Plivo** (Voice API + XML transfer + GetInput speech)
- **Mock** (dev/no network)

Docs: `https://docs.openclaw.ai/plugins/voice-call`
Plugin system: `https://docs.openclaw.ai/plugin`

## Install (local dev)

### Option A: install via OpenClaw (recommended)

```bash
openclaw plugins install @openclaw/voice-call
```

Restart the Gateway afterwards.

### Option B: copy into your global extensions folder (dev)

```bash
mkdir -p ~/.openclaw/extensions
cp -R extensions/voice-call ~/.openclaw/extensions/voice-call
cd ~/.openclaw/extensions/voice-call && pnpm install
```

## Config

Put under `plugins.entries.voice-call.config`:

```json5
{
  provider: "twilio", // or "telnyx" | "plivo" | "mock"
  fromNumber: "+15550001234",
  toNumber: "+15550005678",

  twilio: {
    accountSid: "ACxxxxxxxx",
    authToken: "your_token",
  },

  telnyx: {
    apiKey: "KEYxxxx",
    connectionId: "CONNxxxx",
    // Telnyx webhook public key from the Telnyx Mission Control Portal
    // (Base64 string; can also be set via TELNYX_PUBLIC_KEY).
    publicKey: "...",
  },

  plivo: {
    authId: "MAxxxxxxxxxxxxxxxxxxxx",
    authToken: "your_token",
  },

  // Webhook server
  serve: {
    port: 3334,
    path: "/voice/webhook",
  },

  // Public exposure (pick one):
  // publicUrl: "https://example.ngrok.app/voice/webhook",
  // tunnel: { provider: "ngrok" },
  // tailscale: { mode: "funnel", path: "/voice/webhook" }

  outbound: {
    defaultMode: "notify", // or "conversation"
  },

  streaming: {
    enabled: true,
    streamPath: "/voice/stream",
    preStartTimeoutMs: 5000,
    maxPendingConnections: 32,
    maxPendingConnectionsPerIp: 4,
    maxConnections: 128,
  },
}
```

Notes:

- Twilio/Telnyx/Plivo require a **publicly reachable** webhook URL.
- `mock` is a local dev provider (no network calls).
- Telnyx requires `telnyx.publicKey` (or `TELNYX_PUBLIC_KEY`) unless `skipSignatureVerification` is true.
- advanced webhook, streaming, and tunnel notes: `https://docs.openclaw.ai/plugins/voice-call`

## Stale call reaper

See the plugin docs for recommended ranges and production examples:
`https://docs.openclaw.ai/plugins/voice-call#stale-call-reaper`

## TTS for calls

Voice Call uses the core `messages.tts` configuration (OpenAI or ElevenLabs) for
streaming speech on calls. Override examples and provider caveats live here:
`https://docs.openclaw.ai/plugins/voice-call#tts-for-calls`

## Conversation and IVR behavior

For live two-way calls, start the call in `mode: "conversation"` with streaming
enabled. In that mode the plugin does **not** blindly speak on every final
transcript. Instead, the response engine plans one structured next step:

- `wait` - do nothing yet
- `speak` - say a natural-language reply
- `dtmf` - send keypad digits on the live call
- `hangup` - end the call

Built-in guards suppress common non-actionable inputs before the planner runs,
including:

- recording disclosures
- hold / queue system text
- echoed bot speech
- short garbled STT fragments

Fast paths also exist for common IVR prompts, especially service-intent and
number-entry prompts. If the IVR clearly asks the caller to `press`, `enter`,
or use the `keypad`, the engine can prefer DTMF. If the IVR is speech-only, the
plugin keeps the spoken-response path instead.

Use `responseModel`, `responseSystemPrompt`, and `responseTimeoutMs` to tune the
planner. Restart the OpenClaw Gateway after changing those settings.

For deterministic IVR discovery or other externally controlled workflows, use
`mode: "manual"` instead. Manual mode keeps the call open but disables the
auto-response loop so an external controller can explicitly:

- wait for the next IVR prompt
- speak a controlled utterance
- send DTMF
- end the call when the branch is finished

## Outbound DTMF

Manual outbound DTMF is available through the CLI, the `voice_call` tool, and
gateway RPC.

Supported characters:

- `0-9`
- `A-D`
- `*`
- `#`
- `w` = 0.5 second pause
- `W` = 1.0 second pause

Normalization also accepts common human phrasing:

- `pound` / `hash` -> `#`
- `star` -> `*`
- `,` -> `w`
- `;` -> `W`
- leading verbs such as `press`, `enter`, `dial`, `send`, `use`, and `key in`
  are stripped before validation

Examples:

```bash
openclaw voicecall dtmf --call-id <id> --digits "1"
openclaw voicecall dtmf --call-id <id> --digits "ww5555550123#"
```

```json
{
  "tool": "voice_call",
  "input": {
    "action": "send_dtmf",
    "callId": "<id>",
    "digits": "ww123#"
  }
}
```

Provider support:

- Twilio: supported for live outbound DTMF. The provider updates the live call
  with TwiML `<Play digits="...">` and then redirects back to the normal
  webhook so streaming STT/TTS can resume.
- Telnyx / Plivo: the provider-neutral `sendDtmf(...)` contract exists, but
  outbound DTMF currently returns an explicit not-implemented error on those
  providers.

## OpenClaw skill / tool guidance

For OpenClaw skills and agent prompts:

- use `initiate_call` for a new outbound call
- use `mode: "conversation"` for live IVRs, phone trees, or real back-and-forth
  calls
- use `mode: "manual"` for scripted IVR discovery, deterministic menu replay,
  or any workflow that needs `wait` / `speak` / `dtmf` under external control
- let the built-in conversation planner handle ordinary IVR turns when possible
- use `wait_for_prompt` when you need the next transcript without forcing speech
- use `send_dtmf` as a manual override when the user specifies exact digits or
  when the IVR explicitly asks for keypad input
- use `speak_to_user` only when you want immediate forced speech on the active
  call
- use `get_status` before claiming that a call connected, failed, or finished

## CLI

```bash
openclaw voicecall call --to "+15555550123" --message "Hello from OpenClaw"
openclaw voicecall continue --call-id <id> --message "Any questions?"
openclaw voicecall wait --call-id <id>
openclaw voicecall speak --call-id <id> --message "One moment"
openclaw voicecall dtmf --call-id <id> --digits "ww123#"
openclaw voicecall end --call-id <id>
openclaw voicecall status --call-id <id>
openclaw voicecall tail
openclaw voicecall expose --mode funnel
```

## Tool

Tool name: `voice_call`

Actions:

- `initiate_call` (message, to?, mode?)
- `continue_call` (callId, message)
- `speak_to_user` (callId, message)
- `wait_for_prompt` (callId)
- `send_dtmf` (callId, digits)
- `end_call` (callId)
- `get_status` (callId)

## Gateway RPC

- `voicecall.initiate` (to?, message, mode?)
- `voicecall.continue` (callId, message)
- `voicecall.speak` (callId, message)
- `voicecall.wait` (callId)
- `voicecall.dtmf` (callId, digits)
- `voicecall.end` (callId)
- `voicecall.status` (callId)

## Notes

- Uses webhook signature verification for Twilio/Telnyx/Plivo.
- Adds replay protection for Twilio and Plivo webhooks (valid duplicate callbacks are ignored safely).
- Twilio speech turns include a per-turn token so stale/replayed callbacks cannot complete a newer turn.
- Outbound DTMF accepts `0-9`, `A-D`, `*`, `#`, plus `w`/`W` pauses.
- Twilio preserves the call across the temporary media-stream handoff needed for DTMF playback and then resumes streaming after redirect.
- `responseModel` / `responseSystemPrompt` control AI auto-responses.
- Media streaming requires `ws` and OpenAI Realtime API key.
