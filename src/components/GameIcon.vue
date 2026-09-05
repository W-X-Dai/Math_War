<script setup>
import { computed } from 'vue';

import { icon } from '../ui/icons.js';

const props = defineProps({
  name: { type: String, required: true },
});

const markup = computed(() => icon(props.name));
const body = computed(() => markup.value.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] ?? '');
const fill = computed(() => markup.value.match(/fill="([^"]+)"/)?.[1] ?? 'currentColor');
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true" :fill="fill" v-html="body"></svg>
</template>
