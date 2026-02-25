import type { Server as SocketIOServer } from 'socket.io';

export function registerSocketHandlers(io: SocketIOServer) {
    io.on('connection', (socket) => {
        console.log(`  ↔ Client connected: ${socket.id}`);

        socket.on('disconnect', () => {
            console.log(`  ↔ Client disconnected: ${socket.id}`);
        });

        // TODO: Add handlers for generation control
        // socket.on('outline:approve', ...)
        // socket.on('generation:cancel', ...)
    });
}
