/**
 * Mailer port. Implementations: SMTP (nodemailer) and Console (development:
 * logs the mail incl. magic links to stdout).
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  readonly kind: "smtp" | "console";
  send(msg: MailMessage): Promise<void>;
}
