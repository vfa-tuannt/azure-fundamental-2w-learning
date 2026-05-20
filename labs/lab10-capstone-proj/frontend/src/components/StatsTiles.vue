<script setup lang="ts">
import Card from 'primevue/card'
import Skeleton from 'primevue/skeleton'
import type { MyStats } from '@/api/types'

defineProps<{ stats: MyStats | null }>()

interface Tile {
  key: keyof MyStats
  label: string
}

const tiles: Tile[] = [
  { key: 'challengesCreated', label: 'Challenges Created' },
  { key: 'enrollmentsActive', label: 'In-Progress Enrollments' },
  { key: 'enrollmentsApproved', label: 'Approved Enrollments' },
]
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <Card v-for="tile in tiles" :key="tile.key">
      <template #content>
        <div class="text-xs font-medium uppercase tracking-wide text-slate-500">
          {{ tile.label }}
        </div>
        <div class="mt-2">
          <Skeleton v-if="stats === null" width="3rem" height="2rem" />
          <div v-else class="text-3xl font-semibold text-slate-900">
            {{ stats[tile.key] }}
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>
