const API_SERVER = 'http://localhost:3333';

module.exports = {
    '/dav': {
        target: API_SERVER,
        secure: false,
        changeOrigin: true
    },
    '/trpc': {
        target: API_SERVER,
        secure: false,
        changeOrigin: true
    },
    '/upload': {
        target: API_SERVER,
        secure: false,
        changeOrigin: true
    },
    '/graphql': {
        target: API_SERVER,
        secure: false,
        changeOrigin: true
    },
    '/file': {
        target: API_SERVER,
        secure: false,
        changeOrigin: true
    },
    '/pun': {
        target: API_SERVER,
        secure: false,
        changeOrigin: true,
        autoRewrite: true,
        ws: true
    },
    '/node': {
        target: API_SERVER,
        secure: false,
        changeOrigin: true,
        autoRewrite: true,
        ws: true
    },
    '/rnode': {
        target: API_SERVER,
        secure: false,
        changeOrigin: true,
        autoRewrite: true,
        ws: true
    },
    '/public': {
        target: API_SERVER,
        secure: false,
        changeOrigin: true,
        autoRewrite: true,
        ws: true
    },
    '/lxd': {
        target: API_SERVER,
        secure: false,
        // changeOrigin: true,
        // autoRewrite: true,
        ws: true
    },
    '/rtc': {
        target: API_SERVER,
        // secure: false,
        changeOrigin: true,
        autoRewrite: true,
        ws: true
    }
};