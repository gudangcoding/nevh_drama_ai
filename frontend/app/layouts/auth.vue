<template>
  <div class="auth-shell">
    <slot />
  </div>
</template>

<style scoped>
.auth-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg-base);
}
</style>