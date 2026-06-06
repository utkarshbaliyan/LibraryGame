import type { Client } from "colyseus";

// Global registry: username (lowercase) → Colyseus client
// Allows cross-room message delivery without HTTP round-trips
export const chatSessions = new Map<string, Client>();
