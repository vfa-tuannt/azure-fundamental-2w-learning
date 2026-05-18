<script setup lang="ts">
import Button from 'primevue/button'
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 sm:text-3xl">Challenges</h1>
        <p class="mt-1 text-sm text-slate-600">
          Browse skill challenges your team needs to grow.
        </p>
      </div>
      <Button label="Create Challenge" icon="pi pi-plus" class="self-start sm:self-auto" />
    </div>

    <div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p class="text-sm text-slate-600">
        Challenge list, filters, and pagination will arrive in Phase 2.
      </p>
    </div>
  </div>
</template>
