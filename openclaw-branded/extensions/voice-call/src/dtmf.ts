const LEADING_COMMAND_PATTERN =
  /^\s*(?:please\s+)?(?:press|enter|dial|send|use|key(?:\s+in)?)(?:\s+(?:digits?|dtmf|tones?))?(?::|\s)+/i;

const WORD_ALIAS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(?:pound|hash)\b/gi, "#"],
  [/\bstar\b/gi, "*"],
];

export function normalizeDtmfSequence(input: string): string | null {
  let raw = input.trim();
  if (!raw) {
    return null;
  }

  raw = raw.replace(LEADING_COMMAND_PATTERN, "");
  for (const [pattern, replacement] of WORD_ALIAS_REPLACEMENTS) {
    raw = raw.replace(pattern, replacement);
  }

  let normalized = "";
  for (const char of raw) {
    if (/[0-9*#]/.test(char)) {
      normalized += char;
      continue;
    }
    if (/[a-d]/i.test(char)) {
      normalized += char.toUpperCase();
      continue;
    }
    if (char === "w" || char === "W") {
      normalized += char;
      continue;
    }
    if (char === ",") {
      normalized += "w";
      continue;
    }
    if (char === ";") {
      normalized += "W";
      continue;
    }
    if (/[\s\-_.()[\]]/.test(char)) {
      continue;
    }
    return null;
  }

  return normalized || null;
}
