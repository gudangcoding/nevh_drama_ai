/**
 * Rute pengecekan dan pembaruan versi untuk deployment server / Docker (pembaruan desktop melalui Electron bridge, tidak melalui rute ini)
 */
import { Hono } from 'hono'
import { getServerUpdateState, checkServerUpdate, triggerWatchtowerUpdate } from '../services/server-update.js'
import { success, badRequest } from '../utils/response.js'

const app = new Hono()

// GET /state — versi saat ini + mode pembaruan + hasil pengecekan terakhir
app.get('/state', (c) => success(c, getServerUpdateState()))

// POST /check — tarik manifest rilis dan bandingkan versi
app.post('/check', async (c) => success(c, await checkServerUpdate()))

// POST /apply — picu Watchtower tarik gambar baru dan rebuild container ini (hanya mode watchtower)
app.post('/apply', async (c) => {
  try {
    await triggerWatchtowerUpdate()
    return success(c, { triggered: true })
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
})

export default app
