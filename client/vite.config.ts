import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    // Load env file based on `mode` in the current working directory.
    // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
    const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
    const clientPort = parseInt(env.CLIENT_PORT) || 5174;
    const serverPort = parseInt(env.SERVER_PORT) || 3001;

    return {
        plugins: [tailwindcss()],
        server: {
            port: clientPort,
            open: false, // Handled by run.bat to ensure backend is ready
            proxy: {
                '/api': `http://localhost:${serverPort}`,
                '/history-files': `http://localhost:${serverPort}`,
                '/socket.io': {
                    target: `http://localhost:${serverPort}`,
                    ws: true,
                },
            },
        },
        build: {
            rollupOptions: {
                input: {
                    main: 'index.html',
                    viewer: 'viewer.html',
                },
            },
        },
    };
});
