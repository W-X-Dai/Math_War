<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  confirmLabel: {
    type: String,
    default: '確認',
  },
  danger: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['confirm', 'cancel']);
const dialogRoot = ref(null);
const cancelButton = ref(null);
let previouslyFocused = null;
let inertTargets = [];

function focusableElements() {
  if (!dialogRoot.value) return [];
  return [...dialogRoot.value.querySelectorAll(
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute('hidden'));
}

function makeBackgroundInert() {
  if (typeof document === 'undefined' || !dialogRoot.value) return;
  const dialogContainer = [...document.body.children]
    .find((element) => element === dialogRoot.value || element.contains(dialogRoot.value));
  inertTargets = [...document.body.children]
    .filter((element) => element !== dialogContainer)
    .map((element) => ({ element, wasInert: element.inert }));
  for (const { element } of inertTargets) element.inert = true;
}

function restoreBackground() {
  for (const { element, wasInert } of inertTargets) element.inert = wasInert;
  inertTargets = [];
}

function requestCancel() {
  emit('cancel');
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    requestCancel();
    return;
  }
  if (event.key !== 'Tab') return;
  const elements = focusableElements();
  if (!elements.length) {
    event.preventDefault();
    dialogRoot.value?.focus();
    return;
  }
  const first = elements[0];
  const last = elements.at(-1);
  if (document.activeElement === dialogRoot.value) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    previouslyFocused = document.activeElement;
    await nextTick();
    makeBackgroundInert();
    cancelButton.value?.focus();
    return;
  }
  restoreBackground();
  previouslyFocused?.focus?.();
  previouslyFocused = null;
}, { immediate: true, flush: 'post' });

onBeforeUnmount(() => {
  restoreBackground();
  previouslyFocused?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="dialogRoot"
      class="level-dialog-backdrop confirmation-dialog-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
      aria-describedby="confirmation-dialog-description"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <article class="level-dialog confirmation-dialog" :class="{ 'is-danger': danger }">
        <p class="level-select-kicker">請確認</p>
        <h2 id="confirmation-dialog-title">{{ title }}</h2>
        <p id="confirmation-dialog-description">{{ description }}</p>
        <div class="level-dialog-actions">
          <button
            class="confirmation-confirm-button"
            :class="{ 'is-danger': danger }"
            type="button"
            @click="$emit('confirm')"
          >{{ confirmLabel }}</button>
          <button
            ref="cancelButton"
            class="primary-button"
            type="button"
            @click="requestCancel"
          >取消</button>
        </div>
      </article>
    </div>
  </Teleport>
</template>
