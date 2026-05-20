<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import Avatar from 'primevue/avatar'
import type { ActivityEvent } from '@/api/types'
import { eventCopy, formatRelativeTime } from '@/lib/activity-copy'

defineProps<{ events: ActivityEvent[] }>()

const now = ref(new Date())
const tick = setInterval(() => {
  now.value = new Date()
}, 60_000)
onBeforeUnmount(() => clearInterval(tick))

const initialsFor = computed(() => (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0] ?? ''
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1] ?? ''
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase()
})

function copyFor(event: ActivityEvent) {
  return eventCopy(event)
}

function timeFor(iso: string): string {
  return formatRelativeTime(iso, now.value)
}
</script>

<template>
  <div>
    <div
      v-if="events.length === 0"
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600"
    >
      No activity yet
    </div>
    <ul v-else class="divide-y divide-slate-100">
      <li
        v-for="event in events"
        :key="event.id"
        class="flex items-start gap-3 py-3"
      >
        <Avatar
          v-if="event.user.avatarUrl"
          :image="event.user.avatarUrl"
          shape="circle"
        />
        <Avatar
          v-else
          :label="initialsFor(event.user.name)"
          shape="circle"
        />
        <div class="flex-1 min-w-0">
          <p class="text-sm text-slate-800">
            <i :class="copyFor(event).icon + ' mr-1 text-slate-500'" />
            <span>{{ copyFor(event).text }}</span>
            <router-link
              v-if="copyFor(event).challengeId"
              :to="`/challenges/${copyFor(event).challengeId}`"
              class="ml-1 font-medium text-sky-700 hover:underline"
            >
              {{ copyFor(event).challengeTitle }}
            </router-link>
          </p>
          <p class="mt-0.5 text-xs text-slate-500">
            {{ timeFor(event.createdAt) }}
          </p>
        </div>
      </li>
    </ul>
  </div>
</template>
