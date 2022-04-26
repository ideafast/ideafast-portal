import assert from 'assert';

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

    app.post('/interaction/:uid/login', setNoCache, async (req, res, next) => {
        try {
            if (!req.user) {
                const host = req.headers.host;
                res.redirect(host);
            }
            else {
                const accountID = req.user.id;
                const result = {
                    login: {
                        accountId: accountID
                    },
                };
                await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false });
            }
        } catch (err) {
            next(err);
        }
    });

    app.post('/interaction/:uid/confirm', setNoCache, async (req, res, next) => {
        try {
            const interactionDetails = await provider.interactionDetails(req, res);
            const { prompt: { name, details }, params, session: { accountId } } = interactionDetails;
            assert.strictEqual(name, 'consent');

            let { grantId } = interactionDetails;
            let grant;

            if (grantId) {
                // we'll be modifying existing grant in existing session
                grant = await provider.Grant.find(grantId);
            } else {
                // we're establishing a new grant
                grant = new provider.Grant({
                    accountId,
                    clientId: params.client_id,
                });
            }

            if (details.missingOIDCScope) {
                grant.addOIDCScope(details.missingOIDCScope.join(' '));
            }
            if (details.missingOIDCClaims) {
                grant.addOIDCClaims(details.missingOIDCClaims);
            }

            grantId = await grant.save();

            const consent = { grantId: undefined, };
            if (!interactionDetails.grantId) {
                // we don't have to pass grantId to consent, we're just modifying existing one
                consent.grantId = grantId;
            }

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
