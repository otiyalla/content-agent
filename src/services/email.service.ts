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
