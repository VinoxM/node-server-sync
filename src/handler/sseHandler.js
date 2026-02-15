import { SSEStore } from "../instance/sse/sseStore.js";

const sseStore = new SSEStore();

export const initializeSSEStore = configs => sseStore.initialize(configs)

export const storeSSE = (req, res) => sseStore.store(req, res)

export const broadcastSSE = (channel, event, message) => sseStore.broadcast(channel, event, message)