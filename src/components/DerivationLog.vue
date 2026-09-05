<script setup>
import { prettyFormula } from '../ui/format.js';

defineProps({
  logs: { type: Array, required: true },
});
</script>

<template>
  <section class="derivation-log" aria-labelledby="log-heading">
    <div class="formula-panel-head">
      <span aria-hidden="true">✦</span>
      <h2 id="log-heading">推導紀錄</h2>
    </div>
    <div class="event-list" data-bind="logs" aria-live="polite">
      <template v-if="logs.length">
        <p v-for="log in logs.slice(0, 4)" :key="log.id" class="event-row" :class="`is-${log.tone}`">
          {{ prettyFormula(log.equation) }}
        </p>
      </template>
      <p v-else class="event-row">等待第一筆推導⋯</p>
    </div>
  </section>
</template>
