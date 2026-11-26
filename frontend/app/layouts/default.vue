<template>
  <div class="shell">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <button class="brand" @click="navigateTo('/')">
          <div class="brand-mark">
            <img v-if="showBrandImage" :src="brandLogo" alt="Nevh Drama" class="brand-logo" @error="showBrandImage = false" />
            <span v-else class="brand-fallback">N</span>
          </div>
          <div class="brand-text">
            <span class="brand-name">Nevh Drama</span>
            <span class="brand-sub">Produser Drama AI</span>
          </div>
        </button>
      </div>

      <nav class="header-nav">
        <NuxtLink to="/" class="nav-link" :class="{ active: route.path === '/' }">
          <LayoutGrid :size="15" :stroke-width="1.8" />
          <span>{{ t('layout.nav.projects') }}</span>
        </NuxtLink>
        <NuxtLink to="/settings" class="nav-link" :class="{ active: route.path === '/settings' }">
          <Settings :size="15" :stroke-width="1.8" />
          <span>{{ t('layout.nav.settings') }}</span>
        </NuxtLink>
      </nav>

      <div class="header-right">
        <a
          class="github-link"
          href="https://github.com/gudangcoding/nevh_drama_ai"
          target="_blank"
          rel="noopener"
          aria-label="GitHub"
          title="GitHub"
        >
          <Github :size="15" :stroke-width="1.8" />
        </a>
        <div v-if="user" class="user-chip" :title="t('profile.title')" @click="profileOpen = true">
          <span class="user-avatar">{{ user.username.charAt(0).toUpperCase() }}</span>
          <span class="user-meta">
            <span class="user-name">{{ user.username }}</span>
            <span class="user-role" :class="isAdmin ? 'is-admin' : ''">{{ isAdmin ? t('auth.roleAdmin') : t('auth.roleUser') }}</span>
          </span>
        </div>
        <ThemeToggle />
        <LocaleSwitcher />
      </div>
    </header>

    <!-- Spanduk pandu AI layanan belum dikonfigurasi (menampilkan jika ada salah satu tipe yang hilang) -->
    <div v-if="missingConfigLabels.length" class="config-banner">
      <TriangleAlert :size="14" :stroke-width="1.8" />
      <span>{{ t('layout.banner.missing', { types: missingConfigLabels.join(t('common.listJoin')) }) }}</span>
      <NuxtLink to="/settings" class="config-banner-link">{{ t('layout.banner.goSettings') }}</NuxtLink>
    </div>

    <main class="content">
      <slot />
    </main>

    <ProfileModal :open="profileOpen" @close="profileOpen = false" />
  </div>
</template>

<script setup>
import { LayoutGrid, Settings, TriangleAlert, Github } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { aiConfigAPI } from '~/composables/useApi'
import { useAuth } from '~/composables/useAuth'
import brandLogo from '~/assets/nevh-logo.png'

const { t, locale } = useI18n()
const route = useRoute()
const showBrandImage = ref(true)
const { user, isAdmin } = useAuth()
const profileOpen = ref(false)

// Dievaluasi saat render, peralihan bahasa berlaku secara instan (tidak dapat dierasikan sebagai konstanta level modul)
const SERVICE_TYPE_LABELS = computed(() => ({
  text: t('common.serviceType.text'),
  image: t('common.serviceType.image'),
  video: t('common.serviceType.video'),
}))
const missingConfigLabels = ref([])

async function checkAiConfigs() {
  try {
    const configs = await aiConfigAPI.list()
    const labels = SERVICE_TYPE_LABELS.value
    missingConfigLabels.value = Object.entries(labels)
      .filter(([type]) => !configs.some(c => c.service_type === type && c.is_active))
      .map(([, label]) => label)
  } catch { /* kegagalan pengecekan konfigurasi tidak memblokir halaman */ }
}

onMounted(checkAiConfigs)
// Setelah menyimpan konfigurasi di halaman pengaturan dan kembali, periksa ulang (layout dipakai di banyak halaman, onMounted hanya dipicu sekali)
watch(() => route.path, checkAiConfigs)
// Saat mengganti bahasa antarmuka, teks tipe yang sudah disusun di banner perlu dihitung ulang
watch(locale, checkAiConfigs)
</script>

<style scoped>
.shell {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
  background: var(--bg-base);
}

/* === Header === */
.header {
  display: flex; align-items: center;
  height: 60px; flex-shrink: 0;
  padding: 0 24px;
  gap: 32px;
  background: var(--header-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid var(--border);
  position: relative; z-index: 10;
}

.header-left { display: flex; align-items: center; }

.brand {
  display: flex; align-items: center; gap: 11px;
  background: transparent; border: none; cursor: pointer; padding: 4px 8px 4px 4px;
  text-decoration: none; border-radius: var(--radius);
  transition: background 0.18s var(--ease-out);
}
.brand:hover { background: var(--bg-hover); }
.brand:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}
.brand-mark {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 9px;
  overflow: hidden;
}
.brand-logo {
  width: 34px;
  height: 34px;
  object-fit: contain;
  display: block;
}
.brand-fallback {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-0);
  line-height: 1;
}
.brand-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.15; }
.brand-name {
  font-size: 15px; font-weight: 700;
  /* ChatFire signature: brand wordmark flame orange gradient */
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  letter-spacing: -0.01em;
}
.brand-sub {
  font-size: 10px; font-weight: 400;
  color: var(--text-3); margin-top: 1px;
  letter-spacing: 0.04em;
}

/* Nav — pill segmented group */
.header-nav {
  display: flex; gap: 2px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--overlay-track);
}

/* Header kanan — bahasa pengganti */
.header-right {
  margin-left: auto;
  display: flex; align-items: center;
}
/* Masuk GitHub — sama dengan tombol ikon bulat ThemeToggle */
.github-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  color: var(--text-2);
  transition: all 0.18s var(--ease-out);
  line-height: 1;
}
.github-link:hover { color: var(--text-0); background: var(--bg-hover); }
.github-link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}

/* Chip pengguna (username + role) */
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px 3px 4px;
  margin-right: 4px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--bg-hover);
  cursor: pointer;
  transition: all 0.18s var(--ease-out);
}
.user-chip:hover { border-color: var(--accent, #f04a24); }
.user-avatar {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  font-size: 12px; font-weight: 700;
  color: var(--on-accent);
  background: var(--accent-gradient);
  user-select: none;
}
.user-meta {
  display: flex; flex-direction: column; align-items: flex-start;
  line-height: 1.15;
}
.user-name {
  font-size: 12px; font-weight: 600; color: var(--text-0);
  max-width: 110px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.user-role {
  font-size: 9.5px; font-weight: 600;
  letter-spacing: 0.03em; text-transform: uppercase;
  color: var(--text-3);
}
.user-role.is-admin { color: var(--accent, #f04a24); }
.nav-link {
  display: flex; align-items: center; gap: 6px;
  min-height: 32px;
  padding: 0 16px; border-radius: var(--radius-pill);
  font-size: 13px; font-weight: 600;
  color: var(--text-2); text-decoration: none;
  transition: all 0.18s var(--ease-out);
  border: none;
  line-height: 1;
}
.nav-link:hover { color: var(--text-0); }
.nav-link.active {
  background: var(--seg-active-bg);
  color: var(--text-0);
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}
.nav-link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}

/* Config banner — panduan ketika AI service belum diatur */
.config-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 24px; flex-shrink: 0;
  font-size: 12.5px; color: var(--warn-text);
  background: var(--warn-bg);
  border-bottom: 1px solid var(--warn-border);
  position: relative; z-index: 9;
}
.config-banner-link {
  margin-left: auto;
  font-size: 12.5px; font-weight: 600;
  color: var(--warn-link); text-decoration: none;
  padding: 2px 10px; border-radius: var(--radius-pill);
  border: 1px solid var(--warn-border);
  transition: all 0.18s var(--ease-out);
  line-height: 1.6;
}
.config-banner-link:hover { background: var(--warn-link-hover-bg); color: var(--warn-text); }

/* Content */
.content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
