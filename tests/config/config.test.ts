import { describe, expect, it } from "vitest";
import { effectiveEnv, isValidSmtpUrl, parseDotenv } from "@/server/config";

describe("parseDotenv", () => {
  it("parses comments, quotes, export prefix and escapes", () => {
    const env = parseDotenv(
      [
        "# instance config",
        "WAYFARE_BASE_URL=https://photos.example.com",
        'MAIL_FROM="Wayfare <no-reply@example.com>"',
        "export WAYFARE_ADMIN_EMAILS=a@example.com,b@example.com  # admins",
        "SINGLE='keep $literal # hash'",
        'MULTI="line1\\nline2"',
        "EMPTY=",
        "not a line",
      ].join("\n"),
    );
    expect(env).toEqual({
      WAYFARE_BASE_URL: "https://photos.example.com",
      MAIL_FROM: "Wayfare <no-reply@example.com>",
      WAYFARE_ADMIN_EMAILS: "a@example.com,b@example.com",
      SINGLE: "keep $literal # hash",
      MULTI: "line1\nline2",
      EMPTY: "",
    });
  });
});

describe("effectiveEnv", () => {
  it("lets real env vars override the WAYFARE_ENV bundle", () => {
    const env = effectiveEnv({ WAYFARE_ENV: "WAYFARE_BASE_URL=https://bundle.example\nSMTP_URL=smtp://x", WAYFARE_BASE_URL: "https://real.example" } as unknown as NodeJS.ProcessEnv);
    expect(env.WAYFARE_BASE_URL).toBe("https://real.example");
    expect(env.SMTP_URL).toBe("smtp://x");
    expect(env.WAYFARE_ENV).toBeUndefined();
  });

  it("derives Firebase project and bucket from FIREBASE_CONFIG / GOOGLE_CLOUD_PROJECT", () => {
    expect(effectiveEnv({ FIREBASE_CONFIG: JSON.stringify({ projectId: "p1", storageBucket: "p1.appspot.com" }) } as unknown as NodeJS.ProcessEnv)).toMatchObject({
      FIREBASE_PROJECT_ID: "p1",
      FIREBASE_STORAGE_BUCKET: "p1.appspot.com",
    });
    expect(effectiveEnv({ GOOGLE_CLOUD_PROJECT: "p2" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ FIREBASE_PROJECT_ID: "p2", FIREBASE_STORAGE_BUCKET: "p2.firebasestorage.app" });
    expect(effectiveEnv({ FIREBASE_PROJECT_ID: "own", FIREBASE_STORAGE_BUCKET: "b", GOOGLE_CLOUD_PROJECT: "x" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ FIREBASE_PROJECT_ID: "own", FIREBASE_STORAGE_BUCKET: "b" });
    expect(effectiveEnv({} as unknown as NodeJS.ProcessEnv).FIREBASE_PROJECT_ID).toBeUndefined();
  });
});

describe("isValidSmtpUrl", () => {
  it("accepts well-formed smtp/smtps URLs", () => {
    expect(isValidSmtpUrl("smtps://me%40gmail.com:app-pass@smtp.gmail.com:465")).toBe(true);
    expect(isValidSmtpUrl("smtp://user:pass@mail.example.org:587")).toBe(true);
    expect(isValidSmtpUrl("smtp://localhost:1025")).toBe(true);
  });

  it("rejects malformed URLs", () => {
    expect(isValidSmtpUrl("smtps://me%40gmail.com:pass@://gmail.com")).toBe(false); // real-world typo
    expect(isValidSmtpUrl("https://smtp.example.com")).toBe(false);
    expect(isValidSmtpUrl("smtp.gmail.com")).toBe(false);
    expect(isValidSmtpUrl("smtps://user:pass@gmail")).toBe(false);
  });
});
