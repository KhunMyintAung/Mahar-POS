import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { trackToken, verifyTrackToken } from "@/lib/repairTrack";

describe("repair tracking link", () => {
  const original = process.env.AUTH_SECRET;
  beforeEach(() => { process.env.AUTH_SECRET = "test-secret"; });
  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  });

  it("reads back the job it was issued for", () => {
    const token = trackToken("job-123")!;
    expect(verifyTrackToken(token)).toBe("job-123");
  });

  it("refuses a token pointed at another job", () => {
    const token = trackToken("job-123")!;
    const forged = token.replace("job-123", "job-124");
    expect(verifyTrackToken(forged)).toBeNull();
  });

  it("refuses a tampered or malformed token", () => {
    const token = trackToken("job-123")!;
    expect(verifyTrackToken(`${token.slice(0, -1)}x`)).toBeNull();
    expect(verifyTrackToken("job-123")).toBeNull();
    expect(verifyTrackToken("")).toBeNull();
  });

  it("issues nothing without a secret", () => {
    process.env.AUTH_SECRET = "";
    expect(trackToken("job-123")).toBeNull();
    expect(verifyTrackToken("job-123.abc")).toBeNull();
  });
});
