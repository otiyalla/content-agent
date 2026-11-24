import nodemailer from 'nodemailer';
import { env } from '../config/env';

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465, // true for 465, false for other ports
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    } else {
      console.warn('⚠️ SMTP credentials not fully set. Email service will run in mock mode.');
    }
  }

  /**
   * Sends an HTML email with optional inline images (reference them as
   * <img src="cid:CID">). In dry-run mode the HTML is written to disk instead.
   */
  async sendHtml(
    subject: string,
    html: string,
    attachments: Array<{ filename: string; content: Buffer; cid?: string }> = [],
    dryRunPath?: string,
  ): Promise<boolean> {
    if (!this.transporter || env.DRY_RUN) {
      console.log(`[DRY RUN - Email] To: ${env.EMAIL_TO} | Subject: ${subject} | ${attachments.length} attachment(s)`);
      if (dryRunPath) {
        // Rewrite cid: references to the local file names so the preview opens in a browser.
        const fs = await import('fs');
        const path = await import('path');
        fs.mkdirSync(path.dirname(dryRunPath), { recursive: true });
        let local = html;
        for (const a of attachments) {
          if (!a.cid) continue;
          fs.writeFileSync(path.join(path.dirname(dryRunPath), a.filename), a.content);
          local = local.split(`cid:${a.cid}`).join(a.filename);
        }
        fs.writeFileSync(dryRunPath, local);
        console.log(`  Preview written to ${dryRunPath}`);
      }
      // Missing SMTP settings in a live run is a failure: nobody received this.
      return env.DRY_RUN;
    }

    try {
      await this.transporter.sendMail({ from: env.EMAIL_FROM, to: env.EMAIL_TO, subject, html, attachments });
      console.log(`✅ Email "${subject}" sent to ${env.EMAIL_TO}`);
      return true;
    } catch (error) {
      console.error(`Error sending email "${subject}":`, error);
      return false;
    }
  }

  /**
   * Sends a feature request email to the team based on a user's pain point.
   */
  async sendFeatureRequest(originalPost: string, featureRequestText: string, platform: string, url: string): Promise<boolean> {
    const subject = `[Agent] New Feature Request from ${platform}`;
    const text = `
The Content Agent found a user pain point on ${platform} that Zenlot currently cannot solve.

Original Post:
${originalPost}

Link: ${url}

Suggested Feature Request (from LLM):
${featureRequestText}
`;

    if (!this.transporter || env.DRY_RUN) {
      console.log(`[DRY RUN - Email] To: ${env.EMAIL_TO} | Subject: ${subject}`);
      console.log(text);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: env.EMAIL_TO,
        subject,
        text,
      });
      console.log(`✅ Feature request email sent to ${env.EMAIL_TO}`);
      return true;
    } catch (error) {
      console.error('Error sending feature request email:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
