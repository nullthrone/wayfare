import "server-only";
import type { Mailer } from "../../ports/mailer";

/** Development mailer: prints the whole mail (incl. magic links) to stdout. */
export function createConsoleMailer(): Mailer {
  return {
    kind: "console",
    async send(msg) {
      const line = "─".repeat(72);
      console.log(
        [
          "",
          line,
          "[wayfare:mail] (console mailer – no SMTP_URL configured, mail is NOT sent)",
          `To:      ${msg.to}`,
          `Subject: ${msg.subject}`,
          line,
          msg.text,
          line,
          "",
        ].join("\n"),
      );
    },
  };
}
