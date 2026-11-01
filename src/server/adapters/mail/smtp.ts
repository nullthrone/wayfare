import "server-only";
import nodemailer from "nodemailer";
import type { Mailer } from "../../ports/mailer";

/** SMTP mailer (nodemailer). `url` e.g. smtp://user:pass@host:587 or smtps://user:pass@host:465. */
export function createSmtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    kind: "smtp",
    async send(msg) {
      await transport.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    },
  };
}
