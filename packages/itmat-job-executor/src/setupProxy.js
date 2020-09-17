const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    app.use(
        '/api/*',
        createProxyMiddleware({
            target: {
                protocol: 'http',
                host: 'localhost',
                port: 3003
            },
            changeOrigin: true,
            ws: true
        })
    );
};
