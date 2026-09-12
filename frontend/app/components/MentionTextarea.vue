<template>
  <div class="mention-textarea" ref="wrapEl">
    <!-- Layer highlight mirror: render teks yang sama persis dengan textarea, @referensi diberi warna; teks textarea transparan, hanya menampilkan kursor -->
    <div ref="backdropEl" :class="[inputClass, 'mention-backdrop']" aria-hidden="true">
      <div class="mention-backdrop-content" v-html="highlightedHtml"></div>
    </div>
    <textarea
      ref="taEl"
      :class="[inputClass, 'mention-input']"
      :rows="rows"
      :placeholder="placeholder"
      :value="text"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
      @click="closeMention"
      @scroll="onScroll"
    />
    <Teleport to="body">
      <div v-if="mention.open" ref="dropdownEl" class="mention-dropdown" :style="mentionStyle">
        <template v-if="groupedFiltered.length">
          <template v-for="(group, gi) in groupedFiltered" :key="group.group">
            <div class="mention-group-label">{{ group.group }}</div>
            <button
              v-for="(opt, oi) in group.options"
              :key="group.group + '-' + opt.value"
              type="button"
              :class="['mention-option', { highlighted: flatIndex(gi, oi) === highlightIdx }]"
              @mousedown.prevent="pick(opt)"
              @mousemove="highlightIdx = flatIndex(gi, oi)"
            >
              <span :class="['mention-avatar', `mention-avatar-${opt.kind === 'scene' ? 'scene' : (opt.kind === 'prop' ? 'prop' : 'role')}`]">
                <img v-if="opt.image" :src="opt.image" alt="" @error="$event.target.style.display = 'none'" />
                <component v-else :is="groupIcon(opt.kind)" :size="12" :stroke-width="2" />
              </span>
              <span class="mention-name">@{{ opt.label }}</span>
              <span class="mention-type">{{ opt.group }}</span>
            </button>
          </template>
        </template>
        <div v-else class="mention-empty">{{ t('components.mention.noMatch') }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { User, MapPin, Package } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Aset tanpa gambar menampilkan ikon grup cadangan di dropdown (scene=posisi, prop=bungkusan, karakter=orang) — dinilai berdasarkan kind code, tidak bergantung pada teks tampilan
const groupIcon = (kind) => (kind === 'scene' ? MapPin : kind === 'prop' ? Package : User)

const props = defineProps({
  modelValue: { type: String, default: '' },
  // [{ label, value, kind, group, image? }] — value adalah nama @referensi yang akan disisipkan, kind('character'|'scene'|'prop') adalah nilai logika, group adalah teks grup yang ditampilkan
  options: { type: Array, default: () => [] },
  rows: { type: [Number, String], default: 4 },
  placeholder: { type: String, default: '' },
  inputClass: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'commit'])

const wrapEl = ref(null)
const taEl = ref(null)
const backdropEl = ref(null)
const text = ref(props.modelValue)
const mention = ref({ open: false, start: 0, query: '', top: 0, left: 0 })
const highlightIdx = ref(0)
const dropdownEl = ref(null)

// Saat keyboard atas/bawah bergerak highlight, buat item highlight secara otomatis menggulir ke daftar yang terlihat (transisi yang dipicu oleh mouse mousemove juga tetap terlihat)
watch(highlightIdx, () => {
  nextTick(() => {
    dropdownEl.value
      ?.querySelector('.mention-option.highlighted')
      ?.scrollIntoView({ block: 'nearest' })
  })
})

const DROPDOWN_WIDTH = 240
const DROPDOWN_MAX_HEIGHT = 220

// Dropdown Teleport ke body kemudian menggunakan posisi fixed, setiap perubahan gulir luar/ukuran jendela akan menyebabkannya salah posisi → langsung tutup
function closeOnOuterScroll(e) {
  if (mention.value.open && e?.target !== taEl.value) closeMention()
}
onMounted(() => {
  window.addEventListener('scroll', closeOnOuterScroll, true)
  window.addEventListener('resize', closeOnOuterScroll)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', closeOnOuterScroll, true)
  window.removeEventListener('resize', closeOnOuterScroll)
})

watch(() => props.modelValue, (v) => {
  if (v !== text.value) text.value = v
  mention.value.open = false
})

// Nama yang dapat dirujuk (diurutkan berdasarkan panjang menurun, menjamin prioritas kecocokan terpanjang) dan gaya grupnya (dinilai berdasarkan kind code)
const mentionNames = computed(() => {
  const seen = new Map()
  for (const o of props.options) {
    if (o.value && !seen.has(o.value)) seen.set(o.value, o.kind === 'scene' ? 'scene' : 'role')
  }
  return [...seen.entries()].sort((a, b) => b[0].length - a[0].length)
})

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const highlightRegex = computed(() => {
  if (!mentionNames.value.length) return null
  const alt = mentionNames.value.map(([name]) => escapeRegExp(name)).join('|')
  return new RegExp(`@(${alt})`, 'g')
})

// HTML highlight layer mirror: @referensi dibungkus dengan span warna grup, teks lainnya apa adanya
const highlightedHtml = computed(() => {
  let html = escapeHtml(text.value)
  const re = highlightRegex.value
  if (re) {
    const groupOf = Object.fromEntries(mentionNames.value)
    html = html.replace(re, (m, name) =>
      `<span class="mention-token mention-token-${groupOf[name]}">@${escapeHtml(name)}</span>`)
  }
  if (html.endsWith('\n')) html += '\u200b'
  return html
})

// Sebelum kursor @token terdekat (@ tidak mengandung spasi), jika cocok berada dalam state input referensi
function activeMention() {
  const ta = taEl.value
  if (!ta) return null
  const pos = ta.selectionStart
  const before = ta.value.slice(0, pos)
  const m = before.match(/@([^\s@]{0,20})$/)
  if (!m) return null
  return { start: pos - m[0].length, query: m[1] }
}

// Kursor berada di sebelah sebuah @referensi lengkap (digunakan untuk penghapusan keseluruhan)
function mentionBeforeCaret() {
  const ta = taEl.value
  const pos = ta.selectionStart
  const before = ta.value.slice(0, pos)
  for (const [name] of mentionNames.value) {
    if (before.endsWith(`@${name}`)) return { start: pos - name.length - 1, end: pos }
  }
  return null
}
function mentionAfterCaret() {
  const ta = taEl.value
  const pos = ta.selectionStart
  const after = ta.value.slice(pos)
  for (const [name] of mentionNames.value) {
    if (after.startsWith(`@${name}`)) return { start: pos, end: pos + name.length + 1 }
  }
  return null
}

const filteredOptions = computed(() => {
  const q = mention.value.query.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter(o =>
    String(o.value).toLowerCase().includes(q) || String(o.label || '').toLowerCase().includes(q),
  )
})

const groupedFiltered = computed(() => {
  const groups = []
  for (const opt of filteredOptions.value) {
    const name = opt.group || t('components.mention.fallbackGroup')
    const g = groups.find(item => item.group === name)
    if (g) g.options.push(opt)
    else groups.push({ group: name, options: [opt] })
  }
  return groups
})

const flatList = computed(() => groupedFiltered.value.flatMap(g => g.options))

function flatIndex(gi, oi) {
  let idx = 0
  for (let g = 0; g < gi; g++) idx += groupedFiltered.value[g].options.length
  return idx + oi
}

// Dropdown menggunakan fixed positioning (Teleport ke body), koordinat berdasarkan viewport; ketika ruang di bawah tidak cukup, balik ke atas kursor
const mentionStyle = computed(() => mention.value.above
  ? { left: `${mention.value.left}px`, bottom: `${window.innerHeight - mention.value.top}px` }
  : { left: `${mention.value.left}px`, top: `${mention.value.top}px` })

// Layer mirror div mengukur koordinat kursor textarea
function getCaretCoordinates(textarea, position) {
  const div = document.createElement('div')
  const style = getComputedStyle(textarea)
  const propsToCopy = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textIndent',
  ]
  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.whiteSpace = 'pre-wrap'
  div.style.wordWrap = 'break-word'
  div.style.top = '0'
  div.style.left = '-9999px'
  for (const p of propsToCopy) div.style[p] = style[p]
  div.textContent = textarea.value.substring(0, position)
  const span = document.createElement('span')
  span.textContent = textarea.value.substring(position) || '.'
  div.appendChild(span)
  document.body.appendChild(div)
  const rect = { top: span.offsetTop, left: span.offsetLeft }
  document.body.removeChild(div)
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.7 || 20
  return { ...rect, lineHeight }
}

function updateMentionState() {
  const active = activeMention()
  if (!active) { mention.value.open = false; return }
  // Teks setelah @ sudah tepat sama dengan sebuah nama referensi lengkap, tidak lagi menampilkan daftar (misalnya setelah meng hapus spasi di akhir referensi, kursor berada di referensi lengkap)
  if (mentionNames.value.some(([name]) => name === active.query)) {
    mention.value.open = false
    return
  }
  const ta = taEl.value
  const caret = getCaretCoordinates(ta, ta.selectionStart)
  const rect = ta.getBoundingClientRect()
  const maxLeft = Math.max(0, (wrapEl.value?.clientWidth || DROPDOWN_WIDTH) - DROPDOWN_WIDTH)
  const belowTop = rect.top + caret.top + caret.lineHeight - ta.scrollTop + 4
  // Ketika tidak cukup ruang di bawah, dropdown bergulir ke atas kursor (top diatur sebagai tepat viewport atas baris kursor)
  const above = belowTop + DROPDOWN_MAX_HEIGHT > window.innerHeight - 8 && caret.top > DROPDOWN_MAX_HEIGHT
  mention.value = {
    open: true,
    start: active.start,
    query: active.query,
    top: above ? rect.top + caret.top - ta.scrollTop - 4 : belowTop,
    left: rect.left + Math.min(caret.left, maxLeft),
    above,
  }
  highlightIdx.value = 0
}

function closeMention() {
  mention.value.open = false
}

function setText(next, caret) {
  const ta = taEl.value
  if (ta) {
    ta.value = next
    ta.focus()
    if (caret != null) ta.setSelectionRange(caret, caret)
  }
  text.value = next
  closeMention()
  emit('update:modelValue', next)
  emit('commit', next)
}

function onInput(e) {
  text.value = e.target.value
  emit('update:modelValue', e.target.value)
  updateMentionState()
}

function onScroll() {
  if (backdropEl.value && taEl.value) {
    backdropEl.value.scrollTop = taEl.value.scrollTop
    backdropEl.value.scrollLeft = taEl.value.scrollLeft
  }
  closeMention()
}

function onKeydown(e) {
  const ta = taEl.value
  // @referensi penghapusan keseluruhan: kursor di belakang referensi lengkap tekan Backspace / di depan referensi lengkap tekan Delete, satu bagian di satu kali hapus
  if (ta && (e.key === 'Backspace' || e.key === 'Delete') && ta.selectionStart === ta.selectionEnd) {
    const hit = e.key === 'Backspace' ? mentionBeforeCaret() : mentionAfterCaret()
    if (hit) {
      e.preventDefault()
      const next = ta.value.slice(0, hit.start) + ta.value.slice(hit.end)
      setText(next, hit.start)
      return
    }
  }
  if (!mention.value.open) return
  const total = flatList.value.length
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (total) highlightIdx.value = (highlightIdx.value + 1) % total
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (total) highlightIdx.value = (highlightIdx.value - 1 + total) % total
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (total) {
      e.preventDefault()
      pick(flatList.value[highlightIdx.value] || flatList.value[0])
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeMention()
  }
}

function pick(opt) {
  const ta = taEl.value
  if (!ta) return
  const pos = ta.selectionStart
  const before = ta.value.slice(0, mention.value.start)
  const after = ta.value.slice(pos)
  const insert = `@${opt.value} `
  const next = before + insert + after
  setText(next, before.length + insert.length)
}

function onBlur(e) {
  closeMention()
  emit('commit', e.target.value)
}
</script>

<style scoped>
.mention-textarea {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  min-height: 0;
}
/* Layer highlight mirror: sama kelas dengan textarea menjamin konsistensi tipografi, hanya background/border yang transparan */
.mention-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  overflow: hidden;
  pointer-events: none;
}
.mention-backdrop-content {
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
/* textarea teks transparan, hanya menampilkan kursor; highlight ditutup oleh layer mirror */
.mention-input {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: var(--text-0);
}
.mention-input::placeholder {
  color: var(--text-3);
}
/* @referensi pemberian warna: tidak mengubah jarak huruf/padding, menjamin sejajar dengan teks transparan per-karakat */
.mention-backdrop :deep(.mention-token) {
  border-radius: 4px;
  font-weight: 600;
}
.mention-backdrop :deep(.mention-token-role) {
  color: var(--accent-text);
  background: var(--accent-bg);
}
.mention-backdrop :deep(.mention-token-scene) {
  color: var(--tag-success-text);
  background: var(--success-bg);
}
.mention-dropdown {
  position: fixed;
  z-index: var(--z-menu);
  width: 240px;
  max-height: 220px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  box-shadow: var(--shadow-lg);
}
.mention-group-label {
  padding: 6px 8px 3px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.02em;
}
.mention-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.mention-option.highlighted {
  background: var(--accent-bg);
}
.mention-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bg-2);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}
.mention-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* Tanpa gambar, berikan warna dasar ikon berdasarkan grup */
.mention-avatar-role { color: var(--accent-text); background: var(--accent-bg); }
.mention-avatar-scene { color: var(--tag-success-text); background: var(--success-bg); }
.mention-avatar-prop { color: var(--text-2); background: var(--bg-2); }
.mention-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 550;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mention-type {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-3);
}
.mention-empty {
  padding: 10px;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
}
</style>
