import nodemailer from "nodemailer";

let transporter;

// Lazily builds a transporter. If SMTP_HOST isn't configured (e.g. local
// development), falls back to a "stream" transport that just logs the
// email to the console instead of failing — so the app is runnable out of
// the box without real mail credentials.
function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  } else {
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });
  }

  return transporter;
}

/**
 * Sends an email. Falls back to logging the message to the console when no
 * SMTP server is configured, so verification links are always visible
 * somewhere during local development/testing.
 */
export const sendEmail = async ({ to, subject, html }) => {
  const tx = getTransporter();
  const from = process.env.EMAIL_FROM || "Zevrae <no-reply@zevrae.com>";

  const info = await tx.sendMail({ from, to, subject, html });

  if (!process.env.SMTP_HOST) {
    console.log("\n--- SMTP not configured: email logged instead of sent ---");
    console.log(`To: ${to}\nSubject: ${subject}`);
    console.log(info.message ? info.message.toString() : html);
    console.log("--- end email ---\n");
  }

  return info;
};
