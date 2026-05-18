<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold text-slate-900 sm:text-3xl">
        Challenge #{{ route.params.id }}
      </h1>
      <p class="mt-1 text-sm text-slate-600">
        Detail view, markdown rendering, and enroll/withdraw arrive in Phases 2 and 3.
      </p>
    </div>

    <div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p class="text-sm text-slate-600">Placeholder content.</p>
    </div>
  </div>
</template>
