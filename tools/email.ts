import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
dotenv.config()

export const sendEmail = async (
    to: string,
    subject: string,
    text: string,
    html: string
) => {
    const smtpHost = process.env.EMAIL_HOST;
    const smtpPort = Number(process.env.SMTP_PORT);
    const email = process.env.EMAIL_ADDRESS;
    const password = process.env.EMAIL_PASSWORD;

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: true,
        auth: {
            user: email,
            pass: password,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_ADDRESS, // Replace with your email
        to: to,
        subject: subject,
        text: text,
        html: html,
    };

    await transporter.sendMail(mailOptions);
}
