import {urlencoded} from 'express';
import config from '../utils/configManager';

const body = urlencoded({ extended: false });

export const oidcRoutes = (app, provider) => {
    const { constructor: { errors: { SessionNotFound } } } = provider;

    app.use((req, res, next) => {
        const orig = res.render;
        // you'll probably want to use a full blown render engine capable of layouts
        res.render = (view, locals) => {
            app.render(view, locals, (err, html) => {
                if (err) throw err;
                orig.call(res, '_layout', {
                    ...locals,
                    body: html,
                });
            });
        };
        next();
    });

    function setNoCache(req, res, next) {
        res.set('Pragma', 'no-cache');
        res.set('Cache-Control', 'no-cache, no-store');
        next();
    }

    app.get('/interaction/:uid', setNoCache, async (req, res, next) => {
        try {
            const {
                uid, prompt, params,
            } = await provider.interactionDetails(req, res);

            const client = await provider.Client.find(params.client_id);

            switch (prompt.name) {
                case 'login': {
                    return res.render('login', {
                        client,
                        uid,
                        title: 'Sign-in',
                    });
                }
                case 'consent': {
                    return res.render('interaction', {
                        client,
                        uid,
                        title: 'Sign-in',
                    });
                }
                default:
                    return undefined;
            }
        } catch (err) {
            return next(err);
        }
    });

    app.post('/interaction/:uid/login', setNoCache, body, async (req, res, next) => {
        try {
            if (!req.user) {
                res.redirect(config.oidc.login_url);
            }
            else {
                const userID = req.user.id;
                const result = {
                    login: {
                        account: userID,
                    },
                };
                await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false });
            }
        } catch (err) {
            next(err);
        }
    });

    app.post('/interaction/:uid/confirm', setNoCache, body, async (req, res, next) => {
        try {
            // const { prompt: { name, details } } = await provider.interactionDetails(req, res);
            // assert.equal(name, 'consent');

            // any scopes you do not wish to grant go in here
            //   otherwise details.scopes.new.concat(details.scopes.accepted) will be granted

            // any claims you do not wish to grant go in here
            //   otherwise all claims mapped to granted scopes
            //   and details.claims.new.concat(details.claims.accepted) will be granted

            // replace = false means previously rejected scopes and claims remain rejected
            // changing this to true will remove those rejections in favour of just what you rejected above
            const consent = {
                rejectedScopes: [],
                rejectedClaims: [],
                replace: false,
            };

            const result = { consent };
            await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: true });
        } catch (err) {
            next(err);
        }
    });

    app.get('/interaction/:uid/abort', setNoCache, async (req, res, next) => {
        try {
            const result = {
                error: 'access_denied',
                error_description: 'End-User aborted interaction',
            };
            await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false });
        } catch (err) {
            next(err);
        }
    });

    app.use((err, req, res, next) => {
        if (err instanceof SessionNotFound) {
            // handle interaction expired / session not found error
        }
        next(err);
    });
};
