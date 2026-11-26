<template>
  <Teleport to="body">
    <div v-if="open" class="overlay profile-overlay" @click.self="close">
      <div class="dialog profile-dialog" role="dialog" aria-modal="true" :aria-label="t('profile.title')">
        <div class="dialog-head profile-head">
          <div class="profile-head-title">
            <UserRound :size="16" :stroke-width="1.8" />
            <span class="dialog-title">{{ t('profile.title') }}</span>
          </div>
          <button type="button" class="profile-close" :title="t('common.close')" @click="close">
            <X :size="16" :stroke-width="1.8" />
          </button>
        </div>

        <div class="dialog-body profile-body">
          <!-- Identitas akun -->
          <div class="profile-identity">
            <span class="profile-avatar">{{ user.username.charAt(0).toUpperCase() }}</span>
            <div class="profile-identity-meta">
              <span class="profile-id-name">{{ user.username }}</span>
              <span class="profile-role" :class="isAdmin ? 'is-admin' : ''">{{ isAdmin ? t('auth.roleAdmin') : t('auth.roleUser') }}</span>
            </div>
          </div>

          <!-- Edit profil -->
          <section class="profile-section">
            <h3 class="profile-section-title">{{ t('profile.editProfile') }}</h3>
            <div class="profile-section-body">
              <label class="field">
                <span class="field-label">{{ t('auth.username') }}</span>
                <input
                  v-model.trim="username"
                  class="input"
                  type="text"
                  autocomplete="username"
                  :placeholder="t('auth.usernamePlaceholder')"
                  @keydown.enter.prevent="saveProfile"
                />
                <span class="field-hint">{{ t('auth.usernameHint') }}</span>
              </label>
              <button class="btn btn-primary profile-save" :disabled="profileSaving" @click="saveProfile">
                <Loader2 v-if="profileSaving" :size="13" class="animate-spin" />
                {{ profileSaving ? t('profile.saving') : t('profile.save') }}
              </button>
            </div>
          </section>

          <!-- Ganti kata sandi -->
          <section class="profile-section">
            <h3 class="profile-section-title">{{ t('profile.changePassword') }}</h3>
            <div class="profile-section-body">
              <label class="field">
                <span class="field-label">{{ t('profile.currentPassword') }}</span>
                <input
                  v-model="oldPassword"
                  class="input"
                  type="password"
                  autocomplete="current-password"
                  :placeholder="t('profile.currentPassword')"
                />
              </label>
              <label class="field">
                <span class="field-label">{{ t('profile.newPassword') }}</span>
                <input
                  v-model="newPassword"
                  class="input"
                  type="password"
                  autocomplete="new-password"
                  :placeholder="t('profile.newPassword')"
                />
                <span class="field-hint">{{ t('auth.passwordHint') }}</span>
              </label>
              <label class="field">
                <span class="field-label">{{ t('profile.confirmNewPassword') }}</span>
                <input
                  v-model="confirmPassword"
                  class="input"
                  type="password"
                  autocomplete="new-password"
                  :placeholder="t('profile.confirmNewPassword')"
                  @keydown.enter.prevent="savePassword"
                />
              </label>
              <button class="btn btn-primary profile-save" :disabled="passwordSaving" @click="savePassword">
                <Loader2 v-if="passwordSaving" :size="13" class="animate-spin" />
                {{ passwordSaving ? t('profile.saving') : t('profile.save') }}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { UserRound, X, Loader2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useAuth } from '~/composables/useAuth'
import { toastError } from '~/composables/useToast'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const { t } = useI18n()
const { user, isAdmin, updateProfile, changePassword } = useAuth()

const username = ref('')
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const profileSaving = ref(false)
const passwordSaving = ref(false)

watch(() => props.open, (v) => {
  if (v) {
    username.value = user.value?.username || ''
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  }
})

function close() {
  if (profileSaving.value || passwordSaving.value) return
  emit('close')
}

async function saveProfile() {
  if (profileSaving.value) return
  profileSaving.value = true
  try {
    const updated = await updateProfile(username.value)
    toast.success(t('profile.profileSaved', { username: updated.username }))
    emit('close')
  } catch (err) {
    toastError(err, { fallback: t('profile.profileSaveFailed') })
  } finally {
    profileSaving.value = false
  }
}

async function savePassword() {
  if (passwordSaving.value) return
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    toast.error(t('auth.fillAllFields'))
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.error(t('auth.passwordMismatch'))
    return
  }
  passwordSaving.value = true
  try {
    await changePassword(oldPassword.value, newPassword.value)
    toast.success(t('profile.passwordChanged'))
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (err) {
    toastError(err, { fallback: t('profile.passwordChangeFailed') })
  } finally {
    passwordSaving.value = false
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

watch(() => props.open, (v) => {
  if (v) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
}, { immediate: true })

onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.profile-dialog {
  width: 440px;
  max-width: calc(100vw - 48px);
  align-items: stretch;
}

.profile-head {
  padding: 14px 20px;
}
.profile-head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-0);
}
.profile-head-title svg { color: var(--accent-text); }
.profile-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: auto;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: all 0.18s var(--ease-out);
}
.profile-close:hover { color: var(--text-0); background: var(--bg-hover); }
.profile-close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}

.profile-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-hover);
}
.profile-avatar {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 17px;
  font-weight: 700;
  color: var(--on-accent);
  background: var(--accent-gradient);
  user-select: none;
}
.profile-identity-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.profile-id-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-role {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-3);
}
.profile-role.is-admin { color: var(--accent, #f04a24); }

.profile-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.profile-section-title {
  margin: 0;
  padding: 10px 14px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-2);
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border);
}
.profile-section-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
}

.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-2); }
.field-hint { font-size: 11px; color: var(--text-3); }

.profile-save {
  align-self: flex-start;
  min-height: 34px;
  padding: 0 16px;
  font-size: 12.5px;
}
.profile-save:disabled { opacity: 0.6; cursor: not-allowed; }
</style>