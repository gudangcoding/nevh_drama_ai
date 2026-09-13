<template>
  <div class="page">
    <!-- Kepala kompak: judul + statistik + tombol baru dalam satu baris -->
    <div class="launcher-head">
      <div class="head-left">
        <h1 class="launcher-title">{{ t('index.hero.title') }}</h1>
        <span class="launcher-sub">{{ t('index.hero.sub') }}</span>
      </div>
      <div class="hero-stats">
        <span class="tag">{{ t('index.hero.projectCount', { n: dramas.length }) }}</span>
        <span class="tag tag-success">{{ t('index.hero.activeCount', { n: dramas.filter(d => currentStatus(d) === 'active').length }) }}</span>
        <span class="tag tag-accent">{{ t('index.hero.styleCount', { n: stylePresets.length }) }}</span>
      </div>
      <div class="head-actions">
        <button class="btn btn-icon tour-help-btn" :title="t('tour.helpTitle')" @click="startTour('index', INDEX_TOUR, t)">
          <CircleHelp :size="15" :stroke-width="1.8" />
        </button>
        <button class="btn btn-ghost" @click="openSynopsisDialog" :title="t('index.synopsis.buttonHint')">
          <Wand2 :size="14" :stroke-width="2" />
          {{ t('index.synopsis.button') }}
        </button>
        <button class="btn btn-primary" @click="showCreate = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ t('index.create') }}
        </button>
      </div>
    </div>

    <div class="toolbar">
      <label class="search-box">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input v-model.trim="searchKeyword" class="input" :placeholder="t('index.searchPlaceholder')" />
      </label>
      <div class="chip-row">
        <button
          v-for="f in filters"
          :key="f.value"
          type="button"
          class="filter-chip"
          :class="{ on: statusFilter === f.value }"
          @click="statusFilter = f.value"
        >
          {{ f.label }}
        </button>
      </div>
      <div class="sort-select-wrap">
        <BaseSelect v-model="sortMode" :options="sortOptions" :searchable="false" />
      </div>
    </div>

    <!-- 加载骨架：卡片 -->
    <div v-if="loading" class="project-grid">
      <div v-for="i in 8" :key="i" class="card skeleton-card">
        <div class="skeleton-cover"></div>
        <div class="skeleton-body">
          <div class="skeleton-line w-60"></div>
          <div class="skeleton-line w-40"></div>
        </div>
      </div>
    </div>

    <!-- 项目卡片网格 -->
    <div v-else-if="filteredDramas.length" class="project-grid">
      <article
        v-for="(d, i) in filteredDramas"
        :key="d.id"
        class="card project-card"
        :style="{ animationDelay: `${i * 0.04}s` }"
        tabindex="0"
        role="button"
        :aria-label="t('index.openProjectAria', { title: d.title })"
        @click="openDrama(d)"
        @keydown.enter.prevent="openDrama(d)"
        @keydown.space.prevent="openDrama(d)"
      >
        <div class="project-cover">
          <span class="cover-initial">{{ coverInitial(d) }}</span>
          <span v-if="d.aspect_ratio && d.aspect_ratio !== 'adaptive'" class="cover-ratio">{{ d.aspect_ratio }}</span>
          <div class="status-wrap" @click.stop>
            <AppMenu
              :open="statusMenuId === d.id"
              placement="bottom-start"
              :min-width="120"
              @update:open="(v) => { statusMenuId = v ? d.id : null }"
            >
              <template #trigger>
                <button type="button" class="cover-badge status-badge" :title="t('index.statusBadgeTitle')">
                  <span class="status-dot" :class="statusDotClass(d)"></span>
                  {{ projectStatus(d) }}
                </button>
              </template>
              <AppMenuItem
                v-for="s in statusOptions"
                :key="s.value"
                :selected="currentStatus(d) === s.value"
                @click="setDramaStatus(d, s.value)"
              >{{ s.label }}</AppMenuItem>
            </AppMenu>
          </div>
          <div class="more-wrap" @click.stop>
            <AppMenu
              :open="activeMenuId === d.id"
              placement="bottom-end"
              :min-width="140"
              @update:open="(v) => { activeMenuId = v ? d.id : null }"
            >
              <template #trigger>
                <button class="btn btn-icon btn-sm cover-more" type="button" :title="t('common.more')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
                  </svg>
                </button>
              </template>
              <AppMenuItem @click="activeMenuId = null; openDrama(d)">{{ t('index.openProject') }}</AppMenuItem>
              <AppMenuItem danger @click="activeMenuId = null; dramaToDelete = d">{{ t('index.deleteProject') }}</AppMenuItem>
            </AppMenu>
          </div>
        </div>
        <div class="project-body">
          <h2 class="project-name truncate">{{ d.title }}</h2>
          <div class="project-meta">
            <span v-if="d.style" class="tag tag-accent">{{ styleLabel(d.style) }}</span>
            <span class="dim">{{ t('index.projectMeta', { chars: d.characters?.length || 0, scenes: d.scenes?.length || 0, eps: d.episodes?.length || 0 }) }}</span>
          </div>
          <div class="project-foot dim">
            <Clock :size="11" :stroke-width="1.8" />
            {{ fmtDate(d.updated_at || d.updatedAt) }}
          </div>
        </div>
      </article>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </div>
      <p class="empty-title">{{ dramas.length ? t('index.emptyFilteredTitle') : t('index.emptyTitle') }}</p>
      <p class="empty-desc">{{ dramas.length ? t('index.emptyFilteredDesc') : t('index.emptyDesc') }}</p>
      <button v-if="!dramas.length" class="btn btn-primary" @click="showCreate = true">{{ t('index.create') }}</button>
    </div>

    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <div class="dialog create-dialog">
        <div class="dialog-head">
          <div class="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </div>
          <div class="dialog-head-copy">
            <h2 class="dialog-title">{{ t('index.createDialog.title') }}</h2>
            <p class="dialog-desc">{{ t('index.createDialog.desc') }}</p>
          </div>
        </div>
        <form @submit.prevent="create" class="dialog-form">
          <div class="dialog-body">
            <label class="field">
              <span class="field-label">{{ t('index.createDialog.name') }} <span class="required">*</span></span>
              <input v-model="form.title" class="input" :placeholder="t('index.createDialog.namePlaceholder')" required autofocus />
            </label>
            <label class="field">
              <span class="field-label">{{ t('index.createDialog.style') }}</span>
              <BaseSelect v-model="form.style" :options="styleSelectOptions" :placeholder="t('index.createDialog.stylePlaceholder')" searchable />
              <span v-if="selectedStyleDesc" class="field-hint">{{ selectedStyleDesc }}</span>
            </label>
            <label class="field">
              <span class="field-label">{{ t('index.createDialog.aspectRatio') }}</span>
              <BaseSelect v-model="form.aspect_ratio" :options="aspectRatioOptions" :placeholder="t('index.createDialog.aspectRatioPlaceholder')" />
              <span class="field-hint">{{ t('index.createDialog.aspectRatioHint') }}</span>
            </label>
            <label class="field">
              <span class="field-label">{{ t('index.createDialog.synopsis') }}</span>
              <textarea v-model="form.synopsis" class="input textarea" rows="4" :placeholder="t('index.createDialog.synopsisPlaceholder')"></textarea>
              <span class="field-hint">{{ t('index.createDialog.synopsisHint') }}</span>
            </label>
            <label class="field">
              <span class="field-label">{{ t('index.createDialog.totalEpisodes') }}</span>
              <input v-model.number="form.total_episodes" type="number" class="input" min="1" max="200" :placeholder="t('index.createDialog.autoProduce')" />
              <span class="field-hint">{{ t('index.createDialog.totalEpisodesHint') }}</span>
            </label>
            <div class="field">
              <span class="field-label">{{ t('index.createDialog.autoVideo') }}</span>
              <label class="switch-row">
                <input v-model="form.auto_video" type="checkbox" class="sr-only" />
                <span class="switch" :class="{ on: form.auto_video }"></span>
                <span class="field-hint switch-hint">{{ t('index.createDialog.autoVideoHint') }}</span>
              </label>
            </div>
          </div>
          <div class="dialog-foot">
            <button type="button" class="btn" @click="showCreate = false">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn btn-primary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {{ t('index.createDialog.submit') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ===== Dialog '+ Buat Sinopsis' — ide cerita → sinopsis lengkap via AI ===== -->
    <div v-if="showSynopsis" class="overlay" @click.self="closeSynopsis">
      <div class="dialog create-dialog">
        <div class="dialog-head">
          <div class="dialog-head-main">
            <h2 class="dialog-title">{{ t('index.synopsis.title') }}</h2>
            <p class="dialog-desc">{{ t('index.synopsis.desc') }}</p>
          </div>
        </div>

        <form v-if="!synLoading && !synResult" @submit.prevent="generateSynopsis" class="dialog-form">
          <div class="dialog-body">
            <label class="field">
              <span class="field-label">{{ t('index.synopsis.idea') }} <span class="required">*</span></span>
              <textarea v-model="synForm.idea" class="input textarea" rows="6" :placeholder="t('index.synopsis.ideaPlaceholder')" autofocus></textarea>
              <span class="field-hint">{{ t('index.synopsis.ideaHint') }}</span>
            </label>
            <label class="field">
              <span class="field-label">{{ t('index.synopsis.style') }}</span>
              <BaseSelect v-model="synForm.style" :options="styleSelectOptions" :placeholder="t('index.createDialog.stylePlaceholder')" searchable />
              <span v-if="synStyleDesc" class="field-hint">{{ synStyleDesc }}</span>
            </label>
            <label class="field">
              <span class="field-label">{{ t('index.synopsis.aspectRatio') }}</span>
              <BaseSelect v-model="synForm.aspect_ratio" :options="aspectRatioOptions" :placeholder="t('index.createDialog.aspectRatioPlaceholder')" />
            </label>
          </div>
          <div class="dialog-foot">
            <button type="button" class="btn" @click="closeSynopsis">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="synLoading || !synForm.idea?.trim()">
              <Loader2 v-if="synLoading" :size="13" class="animate-spin" />
              <Sparkles v-else :size="13" />
              {{ t('index.synopsis.generate') }}
            </button>
          </div>
        </form>

        <div v-else-if="synLoading" class="dialog-body syn-loading">
          <Loader2 :size="26" class="animate-spin" />
          <p class="syn-loading-text">{{ t('index.synopsis.generating') }}</p>
          <p class="field-hint">{{ t('index.synopsis.generatingHint') }}</p>
        </div>

        <div v-else-if="synResult" class="dialog-body">
          <div class="syn-result">
            <h3 class="syn-result-title">{{ synResult.title || t('index.synopsis.untitled') }}</h3>
            <p v-if="synResult.genre" class="syn-result-tags">
              <span class="tag tag-accent">{{ synResult.genre }}</span>
              <span class="tag">{{ styleLabel(synResult.style || form.style) }}</span>
            </p>
            <p class="syn-result-text">{{ synResult.synopsis }}</p>
            <p v-if="synResult.tags?.length" class="syn-result-tags">
              <span v-for="tg in synResult.tags" :key="tg" class="tag">{{ tg }}</span>
            </p>
          </div>
          <div class="dialog-foot">
            <button type="button" class="btn" @click="closeSynopsis">{{ t('common.close') }}</button>
            <button type="button" class="btn btn-primary" @click="useSynopsisAsDraft">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {{ t('index.synopsis.useDraft') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="!!dramaToDelete"
      :title="t('index.deleteDialog.title')"
      :message="t('index.deleteDialog.message', { title: dramaToDelete?.title })"
      :loading="deletingDrama"
      @confirm="confirmDelDrama"
      @cancel="dramaToDelete = null"
    />
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { toastError } from '~/composables/useToast'
import { useI18n } from 'vue-i18n'
import { Clock, CircleHelp, Loader2, Sparkles, Wand2 } from 'lucide-vue-next'
import { dramaAPI, stylePresetAPI, synopsisAPI } from '~/composables/useApi'
import BaseSelect from '~/components/BaseSelect.vue'
import { startTour, autoTour } from '~/composables/useTour'
import { useStylePresetLocale } from '~/composables/useStylePresetLocale'

const { t, locale } = useI18n()
const { presetName, presetDesc } = useStylePresetLocale()

const dramas = ref([])
const loading = ref(false)
const showCreate = ref(false)
const searchKeyword = ref('')
const statusFilter = ref('all')
const sortMode = ref('updated')
const sortOptions = computed(() => ([
  { label: t('index.sortUpdated'), value: 'updated' },
  { label: t('index.sortTitle'), value: 'title' },
]))
const activeMenuId = ref(null)
const dramaToDelete = ref(null)
const deletingDrama = ref(false)
const form = ref({ title: '', style: '', aspect_ratio: '16:9', synopsis: '', total_episodes: 1, auto_video: false })
const stylePresets = ref([])
const styleSelectOptions = computed(() => stylePresets.value.map(p => ({ label: presetName(p), value: p.value })))
const synForm = ref({ idea: '', style: '', aspect_ratio: '16:9' })
const synLoading = ref(false)
const synResult = ref(null)
const synExtra = ref(null)
const showSynopsis = ref(false)
function openSynopsisDialog() {
  synForm.value.style = synForm.value.style || form.value.style || stylePresets.value[0]?.value || ''
  synForm.value.aspect_ratio = form.value.aspect_ratio || '16:9'
  synResult.value = null
  showSynopsis.value = true
}
function closeSynopsis() {
  if (synLoading.value) return
  showSynopsis.value = false
  synResult.value = null
}
const synStyleDesc = computed(() => {
  const p = stylePresets.value.find(p => p.value === synForm.value.style)
  return p ? presetDesc(p) : ''
})
async function generateSynopsis() {
  if (!synForm.value.idea?.trim() || synLoading.value) return
  synLoading.value = true
  synResult.value = null
  try {
    const res = await synopsisAPI.generate({
      idea: synForm.value.idea.trim(),
      style: synForm.value.style || undefined,
      aspect_ratio: synForm.value.aspect_ratio || undefined,
    })
    const draft = res?.draft || null
    if (!draft?.synopsis) throw new Error(t('index.synopsis.errorEmpty'))
    synResult.value = draft
  } catch (e) {
    toastError(e)
  } finally {
    synLoading.value = false
  }
}
function useSynopsisAsDraft() {
  const d = synResult.value
  if (!d) return
  if (d.title) form.value.title = d.title
  if (d.style) form.value.style = d.style
  if (d.aspect_ratio) form.value.aspect_ratio = d.aspect_ratio
  if (d.synopsis) form.value.synopsis = d.synopsis
  if (d.genre) form.value.genre = d.genre
  synExtra.value = {
    description: d.description || undefined,
    genre: d.genre || undefined,
    tags: d.tags?.length ? d.tags : undefined,
    cover_prompt: d.cover_prompt || undefined,
  }
  showSynopsis.value = false
  synResult.value = null
  showCreate.value = true
  toast.success(t('index.synopsis.drafted'))
}
const selectedStyleDesc = computed(() => {
  const p = stylePresets.value.find(p => p.value === form.value.style)
  return p ? presetDesc(p) : ''
})
// Label array konstan dievaluasi saat render (peralihan bahasa berlaku secara instan), value adalah nilai logika
const aspectRatioOptions = computed(() => ([
  { label: t('index.ratio.landscape'), value: '16:9' },
  { label: t('index.ratio.portrait'), value: '9:16' },
  { label: t('index.ratio.square'), value: '1:1' },
  { label: t('index.ratio.adaptive'), value: 'adaptive' },
]))
const filters = computed(() => ([
  { label: t('index.status.all'), value: 'all' },
  { label: t('index.status.draft'), value: 'draft' },
  { label: t('index.status.active'), value: 'active' },
  { label: t('index.status.completed'), value: 'completed' },
]))
// Status proyek ditandai oleh pengguna secara manual (dipersistenkan ke dramas.status), tidak lagi dihitung secara otomatis berdasarkan konten
const statusOptions = computed(() => ([
  { label: t('index.status.draft'), value: 'draft' },
  { label: t('index.status.active'), value: 'active' },
  { label: t('index.status.completed'), value: 'completed' },
]))
const statusMenuId = ref(null)

function currentStatus(d) { return d.status || 'draft' }
function projectStatus(d) { return statusOptions.value.find(s => s.value === currentStatus(d))?.label || t('index.status.draft') }
function statusDotClass(d) { return currentStatus(d) === 'active' ? 'on' : currentStatus(d) === 'completed' ? 'done' : '' }

async function setDramaStatus(d, status) {
  statusMenuId.value = null
  if (currentStatus(d) === status) return
  const prev = d.status
  d.status = status
  try {
    await dramaAPI.update(d.id, { status })
  } catch (e) {
    d.status = prev
    toastError(e)
  }
}

function styleLabel(key) {
  const p = stylePresets.value.find(p => p.value === key)
  return p ? presetName(p) : key || ''
}

// Sampul: grayscale tunggal + karakter pertama (status color hanya muncul sebagai titik kecil, sampul netral)
function coverInitial(d) {
  return String(d.title || '?').trim().slice(0, 1).toUpperCase() || '?'
}

const filteredDramas = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const items = dramas.value.filter((d) => {
    const text = [d.title, d.style, styleLabel(d.style), projectStatus(d)].filter(Boolean).join(' ').toLowerCase()
    const matchesSearch = !keyword || text.includes(keyword)
    const matchesStatus = statusFilter.value === 'all' || currentStatus(d) === statusFilter.value
    return matchesSearch && matchesStatus
  })

  return [...items].sort((a, b) => {
    if (sortMode.value === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN')
    return new Date(b.updated_at || b.updatedAt || 0).getTime() - new Date(a.updated_at || a.updatedAt || 0).getTime()
  })
})

async function load() {
  loading.value = true
  try {
    const [res, presets] = await Promise.all([dramaAPI.list(), stylePresetAPI.list()])
    dramas.value = res.items || []
    stylePresets.value = presets || []
    if (!form.value.style && stylePresets.value.length) {
      form.value.style = stylePresets.value[0].value
    }
  } catch (e) {
    toastError(e)
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!form.value.title?.trim()) return
  try {
    const autoGenerate = Boolean(form.value.synopsis?.trim() && (form.value.total_episodes || 1) > 0)
    const payload = { ...form.value, ...(synExtra.value || {}), auto_generate: autoGenerate }
    synExtra.value = null
    const d = await dramaAPI.create(payload)
    if (d?.production) {
      toast.success(t('index.productionStarted', { title: d.title }))
    }
    showCreate.value = false
    navigateTo(`/drama/${d.id}`)
  } catch (e) {
    toastError(e)
  }
}

async function confirmDelDrama() {
  const d = dramaToDelete.value
  if (!d) return
  try {
    deletingDrama.value = true
    await dramaAPI.del(d.id)
    toast.success(t('index.deleted'))
    dramaToDelete.value = null
    load()
  } catch (e) {
    toastError(e)
  } finally {
    deletingDrama.value = false
  }
}

function getEpisodeNumber(d) {
  const episodes = [...(d.episodes || [])]
  if (!episodes.length) return 1
  episodes.sort((a, b) => Number(a.episode_number || a.episodeNumber || 1) - Number(b.episode_number || b.episodeNumber || 1))
  return Number(episodes[0].episode_number || episodes[0].episodeNumber || 1)
}

function getDramaPath(d) {
  return `/drama/${d.id}`
}

function openDrama(d) {
  activeMenuId.value = null
  navigateTo(getDramaPath(d))
}

function latestEpisodeLabel(d) {
  if (!d.episodes?.length) return t('index.noEpisodes')
  return t('index.episodeN', { n: getEpisodeNumber(d) })
}

function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return t('index.time.justNow')
  if (diff < 3600000) return t('index.time.minutesAgo', { n: Math.floor(diff / 60000) })
  if (diff < 86400000) return t('index.time.hoursAgo', { n: Math.floor(diff / 3600000) })
  if (diff < 604800000) return t('index.time.daysAgo', { n: Math.floor(diff / 86400000) })
  return d.toLocaleDateString(locale.value === 'zh' ? 'zh-CN' : locale.value, { month: 'short', day: 'numeric' })
}

onMounted(load)

// ===== Panduan dalam aplikasi (beranda): 3 langkah — selamat datang / buat proyek / pengingat konfigurasi AI =====
const INDEX_TOUR = [
  { element: '#__nuxt', titleKey: 'tour.index.welcome.title', descKey: 'tour.index.welcome.desc' },
  { element: '.nav-link[href="/settings"]', titleKey: 'tour.index.settings.title', descKey: 'tour.index.settings.desc', popoverSide: 'bottom' },
  { element: '.head-actions .btn-primary', titleKey: 'tour.index.create.title', descKey: 'tour.index.create.desc', popoverSide: 'bottom', popoverAlign: 'end' },
]
onMounted(() => setTimeout(() => autoTour('index', INDEX_TOUR, t), 600))
</script>

<style scoped>
.page {
  padding: 20px 28px 48px;
  overflow-y: auto;
  height: 100%;
  display: flex;
  flex-direction: column;
  animation: fadeUp 0.35s var(--ease-out) both;
  background: var(--surface-base);
}

/* Kompak header: judul + sub judul + statistik + baris baru buat */
.launcher-head {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding-bottom: var(--sp-4);
}
.head-left { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.launcher-title {
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--text-0);
  white-space: nowrap;
}
.launcher-sub { color: var(--text-3); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hero-stats { display: flex; gap: var(--sp-2); margin-left: auto; }
.launcher-head .btn { flex-shrink: 0; }
.head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}
.search-box { position: relative; width: 240px; flex: 0 0 auto; }
.search-box svg {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-3);
  pointer-events: none;
}
.search-box .input {
  padding-left: 34px;
  border-radius: var(--radius-pill);
  border-color: var(--border);
  background: var(--bg-hover);
}
.search-box .input:focus { background: var(--surface-input); }
.chip-row { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 1px; }
.filter-chip {
  appearance: none;
  cursor: pointer;
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--overlay-track);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.16s var(--ease-out);
}
.filter-chip:hover { color: var(--text-0); background: var(--bg-active); }
.filter-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}
.filter-chip.on { background: var(--inverse-surface); color: var(--on-inverse); }
.sort-select-wrap { margin-left: auto; width: 132px; flex-shrink: 0; }

/* 项目卡片网格 */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.project-card {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  animation: fadeUp 0.32s var(--ease-out) both;
  transition: border-color 0.16s var(--ease-out), background 0.16s var(--ease-out);
}
.project-card:hover { border-color: var(--border-strong); }
.project-card:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3.5px var(--button-focus);
}

/* Sampul: cahaya lembut brand wash + karakter pertama, status color hanya muncul pada titik */
.project-cover {
  position: relative;
  aspect-ratio: 2.1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-bg) 0%, var(--bg-1) 70%);
  border-bottom: 1px solid var(--border);
}
.cover-initial {
  font-size: 30px;
  font-weight: 700;
  color: var(--accent-text);
  opacity: 0.55;
  user-select: none;
}
.cover-ratio {
  position: absolute;
  right: 10px;
  bottom: 8px;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.02em;
  font-family: var(--font-mono);
}
.cover-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.status-badge { cursor: pointer; transition: background 0.14s var(--ease-out), color 0.14s var(--ease-out); }
.status-badge:hover { color: var(--text-0); background: var(--bg-1); }
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-3);
}
.status-dot.on { background: var(--success); }
.status-dot.done { background: var(--accent); }
.status-wrap { position: absolute; top: 10px; left: 10px; }

.more-wrap { position: absolute; top: 8px; right: 8px; }
.cover-more {
  width: 30px;
  min-width: 30px;
  height: 30px;
  min-height: 30px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  color: var(--text-2);
  opacity: 0;
  transition: opacity 0.15s var(--ease-out), color 0.15s var(--ease-out);
}
.cover-more:hover { color: var(--text-0); }
.project-card:hover .cover-more,
.more-wrap:focus-within .cover-more { opacity: 1; }

/* Badan kartu */
.project-body { padding: 12px 14px 13px; }
.project-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-0);
}
.project-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 7px;
  font-size: 11.5px;
  flex-wrap: wrap;
}
.project-foot {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
}

/* Kartu skeleton */
.skeleton-card { overflow: hidden; }
.skeleton-cover {
  aspect-ratio: 2.1 / 1;
  background: var(--bg-2);
  animation: skeleton-pulse 1.4s ease-in-out infinite alternate;
}
.skeleton-body { padding: 12px 14px 14px; display: grid; gap: 10px; }
.skeleton-line {
  height: 12px;
  border-radius: 99px;
  background: var(--bg-2);
  animation: skeleton-pulse 1.4s ease-in-out infinite alternate;
}
.skeleton-line.w-60 { width: 60%; }
.skeleton-line.w-40 { width: 40%; }
@keyframes skeleton-pulse { to { opacity: 0.55; } }

/* Status kosong memakan sisa tinggi */
.empty-state {
  flex: 1;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  text-align: center;
}
.empty-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  background: var(--bg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  margin-bottom: 4px;
}
.empty-title { font-size: 14px; font-weight: 600; color: var(--text-1); }
.empty-desc { font-size: 12px; color: var(--text-3); max-width: 240px; line-height: 1.6; }

.create-dialog { width: 460px; max-width: calc(100vw - 32px); }
.dialog-head-copy { display: flex; flex-direction: column; gap: 2px; }
.dialog-desc { font-size: 12.5px; color: var(--text-3); }
.modal-icon {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: var(--radius);
  background: var(--accent-bg);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dialog-form {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.dialog-body { display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.required { color: var(--error); }
.field-hint { font-size: 11px; color: var(--text-3); line-height: 1.5; }
.syn-loading { align-items: center; justify-content: center; text-align: center; padding: 36px 0; gap: 8px; color: var(--accent); }
.syn-loading-text { font-size: 13px; color: var(--text-1); margin-top: 4px; }
.syn-result { display: flex; flex-direction: column; gap: 8px; max-height: 46vh; overflow-y: auto; }
.syn-result-title { font-size: 15px; font-weight: 650; color: var(--text-0); }
.syn-result-text { font-size: 12.5px; line-height: 1.7; color: var(--text-1); white-space: pre-wrap; }
.syn-result-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.syn-result-tags .tag { font-size: 11px; }
.switch-row { display: flex; align-items: center; gap: 10px; cursor: pointer; min-height: 27px; }
.switch-hint { margin: 0; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

@media (max-width: 900px) {
  .project-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
}
@media (max-width: 760px) {
  .page { padding: 16px 16px 40px; }
  .launcher-head { flex-wrap: wrap; }
  .launcher-sub { display: none; }
  .hero-stats { display: none; }
  .toolbar { flex-wrap: wrap; }
  .search-box { width: 100%; flex: 1 1 100%; }
  .sort-select-wrap { margin-left: 0; flex: 1; }
  .project-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  .field-row { grid-template-columns: 1fr; }
  .dialog-foot { flex-direction: column-reverse; }
  .dialog-foot .btn { width: 100%; }
}
</style>
