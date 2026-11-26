<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <Toaster position="top-right" :duration="3000" :theme="resolvedTheme" />
  <MigrateOverlay />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { Toaster, toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import MigrateOverlay from '~/components/MigrateOverlay.vue'
import { useDesktopBridge } from '~/composables/useDesktopBridge'
import { useMigrateState } from '~/composables/useMigrateState'
import { useTheme } from '~/composables/useTheme'
import { useAuth } from '~/composables/useAuth'

const { t } = useI18n()
const { resolvedTheme } = useTheme()

// Sesi perangkat otomatis tanpa login (validasi token, sonst dibuat via /auth/device)
const { ensureDeviceSession } = useAuth()
onMounted(() => { ensureDeviceSession() })

// Judul dokumen responsif ( judul statis nuxt.config.ts hanya untuk SSR/cadangan)
useHead(() => ({ title: t('app.title') }))

const bridge = useDesktopBridge()
const { state, begin, update, end } = useMigrateState()

onMounted(() => {
  if (!bridge) return
  bridge.onMigrateProgress((p) => {
    if (p.phase === 'done') {
      update(p)
      // Tunggu sebentar, penutup menampilkan "Selesai", lalu segarkan halaman agar semua sumber data menunjuk ke direktori baru
      setTimeout(() => { end(); location.reload() }, 800)
      return
    }
    if (p.phase === 'error') {
      end()
      return
    }
    if (!state.active) begin()
    update(p)
  })

  // Aktifkan pengecekan pembaruan diam-diam (proses utama otomatis memeriksa setelah 20s, di sini kita ambil hasilnya sedikit kemudian untuk ditampilkan)
  setTimeout(async () => {
    try {
      const s = await bridge.getUpdateState()
      if (s?.status === 'available') {
        toast.info(t('app.updateAvailable', { version: s.latestVersion }), { duration: 8000 })
      }
    } catch { /* diam */ }
  }, 25_000)
})
</script>

<style>
@import url('./assets/studio.css');
</style>
