import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (server/../.env)
dotenv.config({ path: path.join(__dirname, '../../.env') });

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { apiRouter } from './routes/api.js';
import { registerSocketHandlers } from './routes/socket-handlers.js';

const PORT = process.env.SERVER_PORT || 3001;

const app = express();
const httpServer = createServer(app);

const CLIENT_PORT = process.env.CLIENT_PORT || 5174;
const clientOrigin = `http://localhost:${CLIENT_PORT}`;

// Socket.IO with CORS for Vite dev server
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            // Allow any localhost origin in dev
            if (origin.startsWith('http://localhost:')) {
                return callback(null, true);
            }
            if (origin === clientOrigin || origin === 'http://localhost:5174') {
                return callback(null, true);
            }
            callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST'],
    },
});

// Expose io to routes
app.set('io', io);

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        // Allow any localhost origin in dev
        if (origin.startsWith('http://localhost:')) {
            return callback(null, true);
        }
        if (origin === clientOrigin || origin === 'http://localhost:5174') {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    }
}));
app.use(express.json());

// API routes
app.use('/api', apiRouter);

// Serve markdown history files as static
const historyPath = path.join(__dirname, '../../data/history');
app.use('/history-files', express.static(historyPath));

// In production, serve Vite-built client
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));
// SPA fallback - use app.use to match everything not handled above
app.use((_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Socket.IO handlers
registerSocketHandlers(io);

// Start server
httpServer.listen(PORT, () => {
    console.log(`\n  🎓 SyllaBot Pro Server running on http://localhost:${PORT}\n`);
});

export { io };
