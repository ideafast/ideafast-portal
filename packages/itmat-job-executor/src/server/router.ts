import timeout from 'connect-timeout';
import express, { Express } from 'express';
import rateLimit from 'express-rate-limit';

export class Router {
    private readonly app: Express;

    constructor() {
        this.app = express();
        this.app.set('trust proxy', 1);

        this.app.use(rateLimit({
            windowMs: 1 * 60 * 1000,
            max: 500,
            keyGenerator: (req) => {
                const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                return Array.isArray(ip) ? ip[0] : ip || 'unknown';
            }
        }));

        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(timeout('86400000'));
    }

    public getApp(): Express {
        return this.app;
    }
}
