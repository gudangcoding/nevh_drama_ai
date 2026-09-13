/**
 * Tugas ekstraksi aset — dieksekusi secara asinkron, dilacak dengan granularitas "episode × jenis"
 * Karakter / adegan / properti dapat diekstrak secara terpisah, jenis yang berbeda dalam satu episode dapat diproses paralel
 * Status tugas adalah state memori dalam proses: status tugas yang sedang berjalan hilang setelah backend restart (panggilan Agent itu sendiri sudah terputus)
 */
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { agentAbortSignal } from '../utils/agent-timeout.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { describeApiError } from '../utils/error-translate.js'

export type ExtractTarget = 'characters' | 'scenes' | 'props'
export const EXTRACT_TARGETS: ExtractTarget[] = ['characters', 'scenes', 'props']

export interface ExtractTask {
  status: 'running' | 'done' | 'error'
  started_at: string
  finished_at?: string
  error?: string
}

const tasks = new Map<string, ExtractTask>()
const keyOf = (episodeId: number, target: string) => `${episodeId}:${target}`

/** Instruksi ekstraksi untuk setiap jenis aset: dibatasi hanya mengekstrak jenis tersebut, dan meminta deduplikasi serta penggabungan dengan data yang sudah ada */
const EXTRACT_MESSAGES: Record<ExtractTarget, string> = {
  characters: 'Silakan ekstrak semua informasi karakter dari naskah episode ini (penampilan perlu menggabungkan kepribadian, termasuk tata rias), pertama gunakan read_existing_characters untuk membaca karakter yang sudah ada di proyek, nama yang sama atau mirip (dengan lokasi dalam kurung/alias, seperti "Lin Xiaoyu (Protagonis)" dan "Lin Xiaoyu") langsung gunakan yang sudah ada, jangan buat duplikat, lalu simpan dengan save_dedup_characters. Kali ini hanya ekstrak karakter, jangan ekstrak adegan dan properti.',
  scenes: 'Silakan ekstrak semua informasi adegan dari naskah episode ini (lokasi, waktu, pencahayaan, dll), pertama gunakan read_existing_scenes untuk membaca adegan yang sudah ada guna deduplikasi, lalu simpan dengan save_dedup_scenes. Kali ini hanya ekstrak adegan, jangan ekstrak karakter dan properti.',
  props: 'Silakan ekstrak properti kunci dari naskah episode ini — harus memenuhi kedua syarat: ① Mendorong plot secara langsung (kemunculan/penyerahan/kerusakan/pencarian akan memicu titik balik cerita, seperti senjata, benda kenang-kenangan, dokumen kunci, hadiah cinta, bukti); ② Layak dibuatkan gambar produk putih secara terpisah (storyboard akan memberikan close-up atau muncul berulang kali). Tiga pertanyaan penentu, jika salah satu jawabannya "tidak" maka batalkan: jika dihapus cerita masih tetap berjalan? Apakah itu hanya benda sehari-hari yang digunakan sembarangan (ponsel, sumpit, gelas)? Apakah itu perlengkapan adegan (meja, kursi, lampu)? Lebih baik sedikit daripada terlalu banyak, satu episode biasanya 0-3, jika lebih dari 3 hanya simpan 3 yang paling penting, jika tidak ada maka jangan ekstrak satupun (kirim array kosong ke save_dedup_props). description hanya mencatat penampilan benda. Pertama gunakan read_existing_props untuk membaca properti yang sudah ada guna deduplikasi, lalu simpan dengan save_dedup_props. Kali ini hanya ekstrak properti, jangan ekstrak karakter dan adegan.',
}

/** Memulai tugas ekstraksi asinkron (langsung kembali); mengembalikan false jika jenis yang sama di episode yang sama sedang berjalan; dapat menimpa model teks */
export function startExtraction(episodeId: number, dramaId: number, target: ExtractTarget, opts: { model?: string; configId?: number } = {}): boolean {
  const key = keyOf(episodeId, target)
  if (tasks.get(key)?.status === 'running') return false

  const task: ExtractTask = { status: 'running', started_at: new Date().toISOString() }
  tasks.set(key, task)

  logTaskStart('Extract', target, { episodeId, dramaId, model: opts.model || undefined, configId: opts.configId || undefined })
  ;(async () => {
    const agent = mastra.getAgent('extractor')
    if (!agent) throw new Error('Agent ekstraksi tidak tersedia')
    const requestContext = buildAgentRequestContext({
      episodeId,
      dramaId,
      modelOverride: opts.model || undefined,
      textConfigId: opts.configId || undefined,
    })
    return agent.generate([{ role: 'user', content: EXTRACT_MESSAGES[target] }], {
      maxSteps: 20,
      requestContext,
      abortSignal: agentAbortSignal(20),
      // Mencetak kemajuan Agent secara bertahap: tool mana yang dipanggil, output apa yang dihasilkan
      onStepFinish: (step: any) => {
        const tools = (step?.toolCalls || [])
          .map((t: any) => t?.toolName || t?.payload?.toolName)
          .filter(Boolean)
        logTaskProgress('Extract', `${target}-step`, {
          episodeId,
          tools: tools.length ? tools.join(',') : undefined,
          text: (step?.text || '').slice(0, 200) || undefined,
        })
      },
    })
  })()
    .then((result: any) => {
      task.status = 'done'
      task.finished_at = new Date().toISOString()
      const toolNames = (result?.toolCalls || []).map((t: any) => t?.toolName).filter(Boolean)
      logTaskSuccess('Extract', target, {
        episodeId,
        steps: result?.steps?.length,
        toolCalls: toolNames.join(',') || undefined,
        reply: (result?.text || '').slice(0, 300) || undefined,
      })
    })
    .catch((err: any) => {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      task.error = describeApiError(err)
      logTaskError('Extract', target, { episodeId, error: err?.message })
    })
  return true
}

/** Memeriksa status tugas ekstraksi untuk tiga jenis aset dalam satu episode (jenis yang belum pernah dimulai adalah null) */
export function getExtractionStatus(episodeId: number): Record<ExtractTarget, ExtractTask | null> {
  const result = {} as Record<ExtractTarget, ExtractTask | null>
  for (const target of EXTRACT_TARGETS) result[target] = tasks.get(keyOf(episodeId, target)) || null
  return result
}
