import { describe, expect, it } from "vitest";
import { getOutboundRedactPatterns, redactOutboundMessage } from "./redact-outbound.js";

const active = { mode: "messages" as const };

describe("redactOutboundMessage", () => {
  // ── Existing logging patterns still work ──────────────────────────

  it("masks sk- prefixed keys", () => {
    const { text, redacted } = redactOutboundMessage(
      "Key: sk-1234567890abcdefghij",
      active,
    );
    expect(redacted).toBe(true);
    expect(text).toBe("Key: sk-123…ghij");
  });

  it("masks GitHub PATs", () => {
    const { text, redacted } = redactOutboundMessage(
      "ghp_abcdef1234567890abcdefghij",
      active,
    );
    expect(redacted).toBe(true);
    expect(text).not.toContain("ghp_abcdef1234567890abcdefghij");
  });

  it("masks Slack tokens", () => {
    const { text, redacted } = redactOutboundMessage(
      "xoxb-1234567890-abcdefghij",
      active,
    );
    expect(redacted).toBe(true);
    expect(text).not.toContain("xoxb-1234567890-abcdefghij");
  });

  it("masks PEM private keys", () => {
    const input = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "ABCDEF1234567890",
      "ZYXWVUT987654321",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const { text, redacted } = redactOutboundMessage(input, active);
    expect(redacted).toBe(true);
    expect(text).toContain("…redacted…");
    expect(text).not.toContain("ABCDEF1234567890");
  });

  // ── New outbound-specific patterns ────────────────────────────────

  it("masks AWS access keys", () => {
    const { text, redacted } = redactOutboundMessage(
      "Access key: AKIAIOSFODNN7EXAMPLE",
      active,
    );
    expect(redacted).toBe(true);
    expect(text).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("masks Stripe live keys", () => {
    const { text, redacted } = redactOutboundMessage(
      "sk_live_REDACTED_TEST_VALUE_00000",
      active,
    );
    expect(redacted).toBe(true);
    expect(text).not.toContain("sk_live_REDACTED_TEST_VALUE_00000");
  });

  it("masks Stripe test keys", () => {
    const { text, redacted } = redactOutboundMessage(
      "sk_test_REDACTED_TEST_VALUE_00000",
      active,
    );
    expect(redacted).toBe(true);
    expect(text).not.toContain("sk_test_REDACTED_TEST_VALUE_00000");
  });

  it("masks SendGrid keys", () => {
    const { text, redacted } = redactOutboundMessage(
      "SG.abcdefghijklmnopqrstuv.wxyz1234567890abcdefghij",
      active,
    );
    expect(redacted).toBe(true);
    expect(text).not.toContain("SG.abcdefghijklmnopqrstuv.wxyz1234567890abcdefghij");
  });

  it("masks database connection strings", () => {
    const { text, redacted } = redactOutboundMessage(
      "postgres://admin:p4ssw0rd@db.example.com:5432/mydb",
      active,
    );
    expect(redacted).toBe(true);
    expect(text).not.toContain("p4ssw0rd");
  });

  it("masks MongoDB connection strings", () => {
    const { text, redacted } = redactOutboundMessage(
      "mongodb+srv://user:secret@cluster.mongodb.net/db",
      active,
    );
    expect(redacted).toBe(true);
    expect(text).not.toContain("secret");
  });

  it("masks JWT tokens", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const { text, redacted } = redactOutboundMessage(`Token: ${jwt}`, active);
    expect(redacted).toBe(true);
    expect(text).not.toContain(jwt);
  });

  it("masks DigitalOcean tokens", () => {
    const token = `dop_v1_${"a".repeat(64)}`;
    const { text, redacted } = redactOutboundMessage(token, active);
    expect(redacted).toBe(true);
    expect(text).not.toContain(token);
  });

  it("masks Vercel tokens", () => {
    const token = "vercel_abcdef1234567890abcdefgh";
    const { text, redacted } = redactOutboundMessage(token, active);
    expect(redacted).toBe(true);
    expect(text).not.toContain(token);
  });

  it("masks Supabase keys", () => {
    const token = `sbp_${"a".repeat(40)}`;
    const { text, redacted } = redactOutboundMessage(token, active);
    expect(redacted).toBe(true);
    expect(text).not.toContain(token);
  });

  it("masks Twilio keys", () => {
    const token = `SK${"a".repeat(32)}`;
    const { text, redacted } = redactOutboundMessage(token, active);
    expect(redacted).toBe(true);
    expect(text).not.toContain(token);
  });

  it("masks extra sensitive JSON fields", () => {
    const input = '{"database_url":"postgres://user:pass@host/db","name":"test"}';
    const { text, redacted } = redactOutboundMessage(input, active);
    expect(redacted).toBe(true);
    expect(text).not.toContain("postgres://user:pass@host/db");
  });

  it("masks Azure keys in context", () => {
    const { text, redacted } = redactOutboundMessage(
      "AccountKey=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH==",
      active,
    );
    expect(redacted).toBe(true);
    expect(text).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH==");
  });

  // ── Config behavior ───────────────────────────────────────────────

  it("skips redaction when mode is off", () => {
    const input = "sk-1234567890abcdefghij";
    const { text, redacted } = redactOutboundMessage(input, { mode: "off" });
    expect(redacted).toBe(false);
    expect(text).toBe(input);
  });

  it("returns redacted=false for safe text", () => {
    const { text, redacted, count } = redactOutboundMessage(
      "Hello, how are you today?",
      active,
    );
    expect(redacted).toBe(false);
    expect(count).toBe(0);
    expect(text).toBe("Hello, how are you today?");
  });

  it("handles empty string", () => {
    const { text, redacted } = redactOutboundMessage("", active);
    expect(redacted).toBe(false);
    expect(text).toBe("");
  });

  it("returns count >= 1 when secrets found", () => {
    const { count, redacted } = redactOutboundMessage(
      "Key: sk-1234567890abcdefghij and ghp_abcdef1234567890abcdefghij",
      active,
    );
    expect(redacted).toBe(true);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── Pattern list ──────────────────────────────────────────────────

  it("getOutboundRedactPatterns includes default + extra", () => {
    const patterns = getOutboundRedactPatterns();
    // Default has 17, extra has 15
    expect(patterns.length).toBeGreaterThan(20);
  });
});
