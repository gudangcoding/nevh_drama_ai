<template>
  <div class="auth-page">
    <div class="auth-card" @keydown.enter="onSubmit">
      <div class="auth-brand">
        <div class="brand-mark">
          <img v-if="showBrandImage" :src="brandLogo" alt="Nevh Drama" class="brand-logo" @error="showBrandImage = false" />
          <span v-else class="brand-fallback">N</span>
        </div>
        <h1 class="auth-title">{{ t('auth.registerTitle') }}</h1>
        <p class="auth-sub">{{ t('auth.registerSubtitle') }}</p>
      </div>

      <form class="auth-form" @submit.prevent="onSubmit" novalidate>
        <label class="field">
          <span class="field-label">{{ t('auth.username') }}</span>
          <input
            v-model.trim="username"
            class="input"
            type="text"
            autocomplete="username"
            :placeholder="t('auth.usernamePlaceholder')"
            autofocus
          />
          <span class="field-hint">{{ t('auth.usernameHint') }}</span>
        </label>
        <label class="field">
          <span class="field-label">{{ t('auth.password') }}</span>
          <input
            v-model="password"
            class="input"
            type="password"
            autocomplete="new-password"
            :placeholder="t('auth.passwordPlaceholder')"
          />
          <span class="field-hint">{{ t('auth.passwordHint') }}</span>
        </label>
        <label class="field">
          <span class="field-label">{{ t('auth.confirmPassword') }}</span>
          <input
            v-model="confirmPassword"
            class="input"
            type="password"
            autocomplete="new-password"
            :placeholder="t('auth.confirmPasswordPlaceholder')"
          />
        </label>

        <div v-if="error" class="auth-error">
          <TriangleAlert :size="14" :stroke-width="1.8" />
          <span>{{ error }}</span>
        </div>

        <button class="btn btn-primary auth-submit" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner" aria-hidden="true"></span>
          <span>{{ loading ? t('auth.creatingAccount') : t('auth.register') }}</span>
        </button>
      </form>

      <p class="auth-alt">
        {{ t('auth.haveAccount') }}
        <NuxtLink to="/login" class="auth-link">{{ t('auth.login') }}</NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup>
import { TriangleAlert } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useAuth } from '~/composables/useAuth'
import brandLogo from '~/assets/nevh-logo.png'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const { register } = useAuth()

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const showBrandImage = ref(true)

async function onSubmit() {
  if (loading.value) return
  if (!username.value || !password.value) {
    error.value = t('auth.fillAllFields')
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = t('auth.passwordMismatch')
    return
  }
  loading.value = true
  error.value = ''
  try {
    await register(username.value, password.value)
    toast.success(t('auth.registerSuccess'))
    await navigateTo('/')
  } catch (err) {
    error.value = err?.message || t('auth.registerFailed')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(ellipse at 20% 0%, var(--glow-accent, rgba(255,94,58,0.08)) 0%, transparent 55%),
    radial-gradient(ellipse at 85% 100%, var(--glow-blue, rgba(76,144,255,0.08)) 0%, transparent 55%),
    var(--bg-base);
}

.auth-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 34px 32px 26px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
}

.auth-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.brand-mark {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 4px;
}
.brand-logo { width: 48px; height: 48px; object-fit: contain; display: block; }
.brand-fallback {
  font-size: 22px; font-weight: 700; color: var(--text-0); line-height: 1;
}

.auth-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin: 0;
}
.auth-sub { font-size: 13px; color: var(--text-3); margin: 0; }

.auth-form { display: flex; flex-direction: column; gap: 14px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12.5px; font-weight: 600; color: var(--text-2); }
.field-hint { font-size: 11.5px; color: var(--text-3); }

.auth-error {
  display: flex; align-items: center; gap: 8px;
  font-size: 12.5px; color: var(--warn-text);
  background: var(--warn-bg);
  border: 1px solid var(--warn-border);
  border-radius: var(--radius);
  padding: 8px 12px;
}

.auth-submit { justify-content: center; margin-top: 2px; min-height: 40px; }
.auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }

.spinner {
  width: 14px; height: 14px;
  border: 2px solid var(--on-accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.auth-alt { font-size: 13px; color: var(--text-2); text-align: center; margin: 0; }
.auth-link {
  color: var(--accent, #f04a24);
  font-weight: 600;
  text-decoration: none;
}
.auth-link:hover { text-decoration: underline; }
</style>