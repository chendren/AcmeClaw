import { TerminalStates, type CallRecord, type CallState, type TranscriptEntry } from "../types.js";

const ConversationStates = new Set<CallState>(["speaking", "listening"]);
const PENDING_USER_TRANSCRIPTS_KEY = "pendingUserTranscripts";

const StateOrder: readonly CallState[] = [
  "initiated",
  "ringing",
  "answered",
  "active",
  "speaking",
  "listening",
];

export function transitionState(call: CallRecord, newState: CallState): void {
  // No-op for same state or already terminal.
  if (call.state === newState || TerminalStates.has(call.state)) {
    return;
  }

  // Terminal states can always be reached from non-terminal.
  if (TerminalStates.has(newState)) {
    call.state = newState;
    return;
  }

  // Allow cycling between speaking and listening (multi-turn conversations).
  if (ConversationStates.has(call.state) && ConversationStates.has(newState)) {
    call.state = newState;
    return;
  }

  // Only allow forward transitions in state order.
  const currentIndex = StateOrder.indexOf(call.state);
  const newIndex = StateOrder.indexOf(newState);
  if (newIndex > currentIndex) {
    call.state = newState;
  }
}

export function addTranscriptEntry(call: CallRecord, speaker: "bot" | "user", text: string): void {
  const entry: TranscriptEntry = {
    timestamp: Date.now(),
    speaker,
    text,
    isFinal: true,
  };
  call.transcript.push(entry);
}

export function queuePendingUserTranscript(call: CallRecord, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  const metadata = (call.metadata ??= {});
  const existing = metadata[PENDING_USER_TRANSCRIPTS_KEY];
  const queue = Array.isArray(existing)
    ? existing.filter((item): item is string => typeof item === "string")
    : [];
  queue.push(trimmed);
  metadata[PENDING_USER_TRANSCRIPTS_KEY] = queue.slice(-5);
}

export function consumePendingUserTranscript(call: CallRecord): string | null {
  const metadata = call.metadata;
  if (!metadata) {
    return null;
  }
  const existing = metadata[PENDING_USER_TRANSCRIPTS_KEY];
  if (!Array.isArray(existing) || existing.length === 0) {
    return null;
  }
  const next = existing.find((item): item is string => typeof item === "string" && item.trim().length > 0);
  const remaining = existing.slice(next ? existing.indexOf(next) + 1 : existing.length).filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  if (remaining.length > 0) {
    metadata[PENDING_USER_TRANSCRIPTS_KEY] = remaining;
  } else {
    delete metadata[PENDING_USER_TRANSCRIPTS_KEY];
  }
  return next ?? null;
}
