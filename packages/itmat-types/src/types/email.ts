import { Attachment } from 'nodemailer/lib/mailer';

export interface IMail {
    from: string,
    to: string,
    subject: string,
    html: string,
    attachments?: Attachment[];
}
