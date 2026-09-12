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

// Pulihkan sesi login setelah muat ulang halaman (validasi token via /auth/me)
const { restoreSession } = useAuth()
onMounted(() => { restoreSession() })

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

/* === Override tema panduan dalam aplikasi (driver.js) — mengikuti token desain === */
.huobao-tour-popover {
  background: var(--surface-raised) !important;
  color: var(--text-1) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-lg) !important;
  box-shadow: var(--shadow-elevated) !important;
  max-width: 340px;
}
.huobao-tour-popover .driver-popover-title {
  color: var(--text-0) !important;
  font: 700 14px/1.3 var(--font-body) !important;
  letter-spacing: -0.01em;
}
.huobao-tour-popover .driver-popover-description {
  color: var(--text-2) !important;
  font: 400 12.5px/1.65 var(--font-body) !important;
}
.huobao-tour-popover .driver-popover-progress-text {
  color: var(--text-3) !important;
  font-size: 10.5px !important;
}
.huobao-tour-popover .driver-popover-close-btn {
  color: var(--text-3) !important;
}
.huobao-tour-popover .driver-popover-navigation-btns {
  gap: 6px;
}
.huobao-tour-popover .driver-popover-navigation-btns button {
  background: var(--button-bg) !important;
  color: var(--button-text) !important;
  border: none !important;
  border-radius: var(--radius-pill) !important;
  padding: 5px 14px !important;
  font: 600 12px var(--font-body) !important;
  text-shadow: none !important;
  cursor: pointer;
}
.huobao-tour-popover .driver-popover-navigation-btns button.driver-popover-next-btn,
.huobao-tour-popover .driver-popover-navigation-btns button.driver-popover-done-btn {
  background: var(--accent-gradient) !important;
  color: var(--on-accent) !important;
}
.driver-overlay {
  background: var(--scrim) !important;
  backdrop-filter: blur(2px);
}
/* Garis tepak highlight menggunakan oranye brand */
.driver-active-element .driver-popover-arrow svg path,
.driver-active-element .driver-popover-arrow svg polygon {
  fill: var(--accent) !important;
}
</style>
