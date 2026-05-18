<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold text-slate-900 sm:text-3xl">My Profile</h1>
      <p class="mt-1 text-sm text-slate-600">
        Profile, stats, and enrolled challenges arrive in Phase 3.
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="stat in ['Created', 'Enrolled', 'Approved']"
        :key="stat"
        class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div class="text-xs font-medium uppercase tracking-wide text-slate-500">{{ stat }}</div>
        <div class="mt-2 text-3xl font-semibold text-slate-900">—</div>
      </div>
    </div>
  </div>
</template>
