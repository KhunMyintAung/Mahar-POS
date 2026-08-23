import { afterEach, describe, expect, it } from "vitest";
import { businessNameFrom, googleAuthUrl, googleConfig, usernameFromEmail } from "@/lib/googleAuth";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function configure(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("google config", () => {
  it("is off unless every piece is present", () => {
    // A half-configured deployment must not offer the button: the redirect URI is built
    // from APP_URL, and a wrong one fails at Google with nothing useful shown.
    const complete = {
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      APP_URL: "https://walletnote.example",
    };
    for (const missing of Object.keys(complete)) {
      configure({ ...complete, [missing]: undefined });
      expect(googleConfig(), `missing ${missing}`).toBeNull();
    }
    configure(complete);
    expect(googleConfig()).not.toBeNull();
  });

  it("treats blank settings as absent", () => {
    configure({ GOOGLE_CLIENT_ID: "  ", GOOGLE_CLIENT_SECRET: "s", APP_URL: "https://x.example" });
    expect(googleConfig()).toBeNull();
  });

  it("builds the callback under the app's own address", () => {
    configure({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      APP_URL: "https://walletnote.example/",
    });
    // The trailing slash is the shape people actually paste into an env file.
    expect(googleConfig()?.redirectUri).toBe(
      "https://walletnote.example/api/v1/auth/google/callback"
    );
  });
});

describe("google authorisation url", () => {
  const config = {
    clientId: "the-client",
    clientSecret: "the-secret",
    redirectUri: "https://walletnote.example/api/v1/auth/google/callback",
  };

  it("asks only for who the person is", () => {
    const url = new URL(googleAuthUrl(config, "state-123"));
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("carries the state, which is what makes the callback verifiable", () => {
    const url = new URL(googleAuthUrl(config, "state-123"));
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("never puts the secret in a browser-visible url", () => {
    const url = googleAuthUrl(config, "state-123");
    expect(url).not.toContain(config.clientSecret);
  });

  it("lets someone pick an account on a shared device", () => {
    const url = new URL(googleAuthUrl(config, "s"));
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });
});

describe("username from a google address", () => {
  it("uses the part before the @", () => {
    expect(usernameFromEmail("khunmyintaung@gmail.com")).toBe("khunmyintaung");
  });

  it("drops what a username may not contain", () => {
    expect(usernameFromEmail("khun.myint+shop@gmail.com")).toBe("khunmyintshop");
    expect(usernameFromEmail("KHUN.Myint@Gmail.com")).toBe("khunmyint");
  });

  it("meets the minimum length the registration form enforces", () => {
    // "a@x.com" would otherwise produce a one-character username and be rejected.
    expect(usernameFromEmail("a@x.com").length).toBeGreaterThanOrEqual(3);
    expect(usernameFromEmail("...@x.com")).toBe("user");
  });

  it("stays inside the maximum, suffix included", () => {
    const long = `${"a".repeat(60)}@x.com`;
    expect(usernameFromEmail(long).length).toBeLessThanOrEqual(40);
    expect(usernameFromEmail(long, 19).length).toBeLessThanOrEqual(40);
  });

  it("gives a different name for each attempt, so a collision can be walked past", () => {
    const seen = new Set([0, 1, 2, 3].map((n) => usernameFromEmail("ko@x.com", n)));
    expect(seen.size).toBe(4);
  });
});

describe("business name for a google signup", () => {
  it("uses the person's own name", () => {
    expect(businessNameFrom({ email: "k@x.com", name: "Khun Myint Aung" })).toBe("Khun Myint Aung");
  });

  it("falls back to the address when google sends no name", () => {
    expect(businessNameFrom({ email: "khunmyint@x.com" })).toBe("khunmyint");
    expect(businessNameFrom({ email: "khunmyint@x.com", name: "  " })).toBe("khunmyint");
  });

  it("always meets the two-character minimum", () => {
    expect(businessNameFrom({ email: "k@x.com" }).length).toBeGreaterThanOrEqual(2);
    expect(businessNameFrom({ email: "k@x.com", name: "A" }).length).toBeGreaterThanOrEqual(2);
  });

  it("stays inside the eighty-character maximum", () => {
    expect(businessNameFrom({ email: "k@x.com", name: "N".repeat(200) }).length).toBe(80);
  });
});
