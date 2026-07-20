import nodemailer from "nodemailer";
let transporter;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g. "smtp.gmail.com"
      port: Number(process.env.SMTP_PORT) || 465, // Gmail SSL port
      secure: true, // Gmail requires TLS/SSL
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      family: 4, // 👈 Force IPv4 to avoid ENETUNREACH
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
