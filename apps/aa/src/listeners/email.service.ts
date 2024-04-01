import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;
  private readonly logger = new Logger(EmailService.name);

  initialize() {
    if (!this.transporter) {
      console.log('Initializing email service');
      const smtpHost = process.env.EMAIL_HOST;
      const smtpPort = process.env.SMTP_PORT;
      const email = process.env.EMAIL_ADDRESS;
      const password = process.env.EMAIL_PASSWORD;

      this.transporter = nodemailer.createTransport({
        pool: true,
        host: smtpHost,
        port: smtpPort,
        secure: true,
        auth: {
          user: email,
          pass: password,
        },
      });
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html: string
  ): Promise<void> {
    this.initialize();
    const mailOptions = {
      from: process.env.EMAIL_ADDRESS, // Replace with your email
      to: to,
      subject: subject,
      text: text,
      html: html,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log('Email sent:', info.messageId);
    } catch (error) {
      this.logger.error('Error sending email:', error);
      throw error;
    }
  }
}
