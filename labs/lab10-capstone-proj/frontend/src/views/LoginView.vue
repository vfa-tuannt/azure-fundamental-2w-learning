<script setup lang="ts">
import Button from 'primevue/button'
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
    <div
      class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div class="text-center">
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-600"
        >
          <i class="pi pi-bolt text-xl" />
        </div>
        <h1 class="mt-4 text-xl font-semibold text-slate-900 sm:text-2xl">SkillChallenge</h1>
        <p class="mt-1 text-sm text-slate-600">Sign in to access the platform</p>
      </div>

      <Button
        label="Sign in with Google"
        icon="pi pi-google"
        class="!mt-6 w-full"
        severity="primary"
      />
      <p class="mt-3 text-center text-xs text-slate-500">
        Only @vitalify.asia accounts are allowed.
      </p>
    </div>
  </div>
</template>
