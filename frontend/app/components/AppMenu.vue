<template>
  <span ref="anchorEl" class="app-menu-anchor" :class="{ block }" @click="toggle">
    <slot name="trigger" :open="isOpen" />
  </span>
  <Teleport to="body">
    <Transition name="app-menu">
      <div
        v-if="isOpen"
        ref="panelEl"
        class="app-menu"
        :style="panelStyle"
        :data-placement="placement"
        role="menu"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { usePopover } from '~/composables/usePopover'

/**
 * AppMenu — panel menu dropdown yang seragam di seluruh situs (Teleport + posisi/animasi/lapis yang seragam)
 * Pemicu dikustomisasi oleh pemanggil melalui trigger slot (memeliharta bentuk masing-masing), hanya layer menu yang diseragamkan.
 * Item menu harap menggunakan AppMenuItem.
 */
const props = withDefaults(defineProps<{
  open?: boolean
  placement?: 'bottom-start' | 'bottom-end' | 'bottom'
  matchWidth?: boolean
  minWidth?: number
  maxHeight?: number
  block?: boolean
}>(), {
  open: undefined,
  placement: 'bottom-start',
  matchWidth: false,
  minWidth: 160,
  maxHeight: 320,
  block: false,
})
const emit = defineEmits<{ 'update:open': [boolean] }>()

const { isOpen, anchorEl, panelEl, panelStyle, placement: actualPlacement, toggle } = usePopover({
  placement: props.placement,
  matchWidth: props.matchWidth,
  minWidth: props.minWidth,
  maxHeight: props.maxHeight,
})

// Jembatan dua arah v-model:open luar dengan status internal
watch(() => props.open, (v) => { if (v !== undefined && v !== isOpen.value) isOpen.value = v })
watch(isOpen, (v) => emit('update:open', v))

const placement = actualPlacement
</script>
