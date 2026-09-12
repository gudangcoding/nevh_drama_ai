/**
 * Instance pusat Mastra — titik pemasangan registri Agent
 * Tidak menggunakan Mastra logger (proyek sudah memiliki pino + task-logger)
 */
import { Mastra } from '@mastra/core/mastra'
import { agentRegistry } from '../agents/index.js'

export const mastra = new Mastra({
  agents: agentRegistry,
  logger: false,
})
