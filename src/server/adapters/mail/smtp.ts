import "server-only";
import nodemailer from "nodemailer";
import type { Mailer } from "../../ports/mailer";

/** SMTP mailer (nodemailer). `url` e.g. smtp://user:pass@host:587 or smtps://user:pass@host:465. */
export function createSmtpMailer(url: string, from: string): Mailer {
  let transport: ReturnType<typeof nodemailer.createTransport>;
  try {
    transport = nodemailer.createTransport(url);
  } catch {
    // Never let the URL (it contains the SMTP password) reach logs or error pages.
    throw new Error("Invalid SMTP_URL - expected smtps://user:password@smtp.example.com:465");
  }
  return {
    kind: "smtp",
    async send(msg) {
      await transport.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    },
  };
}
