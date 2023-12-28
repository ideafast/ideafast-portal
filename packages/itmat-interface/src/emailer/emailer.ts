import nodemailer from 'nodemailer';
import * as SMTPTransport from 'nodemailer/lib/smtp-transport';
import appConfig from '../utils/configManager';
import { IMail } from '@itmat-broker/itmat-types';

class Mailer {
    private readonly _client: nodemailer.Transporter;

    constructor(config: SMTPTransport.Options) {
        this._client = nodemailer.createTransport(config);
    }

    public async sendMail(mail: IMail): Promise<void> {
        await this._client.sendMail(mail);
    }
}

export const mailer = new Mailer(appConfig.nodemailer);
