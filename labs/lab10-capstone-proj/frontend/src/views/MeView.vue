<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import ActivityTimeline from '@/components/ActivityTimeline.vue'
import StatsTiles from '@/components/StatsTiles.vue'
import { getMyStats } from '@/api/me'
import { useActivityStore } from '@/stores/activity'
import { useAuthStore } from '@/stores/auth'
import { useEnrollmentsStore } from '@/stores/enrollments'
import type { EnrollmentStatus, MyEnrollment, MyStats } from '@/api/types'

const router = useRouter()
const auth = useAuthStore()
const enrollments = useEnrollmentsStore()
const activity = useActivityStore()
const stats = ref<MyStats | null>(null)

const initials = computed(() => {
  if (!auth.user) return '?'
  const parts = auth.user.name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0] ?? ''
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1] ?? ''
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase()
})

onMounted(() => {
  if (!enrollments.myListLoaded) {
    void enrollments.loadMyList()
  }
  getMyStats()
    .then((s) => {
      stats.value = s
    })
    .catch(() => {
      // Stats failure is non-fatal — leave skeleton state
    })
  void activity.loadMine()
})

function statusSeverity(
  status: EnrollmentStatus,
): 'info' | 'warn' | 'success' | 'danger' {
  switch (status) {
    case 'in_progress':
      return 'info'
    case 'submitted':
      return 'warn'
    case 'approved':
      return 'success'
    case 'rejected':
      return 'danger'
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString()
}

function onRowClick(event: { data: MyEnrollment }) {
  void router.push(`/challenges/${event.data.challenge.id}`)
}
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-center gap-4">
        <Avatar
          v-if="auth.user?.avatarUrl"
          :image="auth.user.avatarUrl"
          size="xlarge"
          shape="circle"
        />
        <Avatar v-else :label="initials" size="xlarge" shape="circle" />
        <div>
          <h1 class="text-2xl font-semibold text-slate-900">
            {{ auth.user?.name ?? 'Unknown' }}
          </h1>
          <p class="text-sm text-slate-600">{{ auth.user?.email ?? '' }}</p>
        </div>
      </div>
    </div>

    <StatsTiles :stats="stats" />

    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="text-lg font-semibold text-slate-900">My Challenges</h2>
      <p class="mt-1 text-sm text-slate-600">
        Challenges you've enrolled in, newest first.
      </p>

      <Skeleton v-if="enrollments.loading && !enrollments.myListLoaded" class="mt-4" height="6rem" />

      <div
        v-else-if="enrollments.myList.length === 0"
        class="mt-6 rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center"
      >
        <p class="text-sm text-slate-600">
          You haven't enrolled in any challenges yet.
        </p>
        <Button
          label="Browse challenges"
          icon="pi pi-arrow-right"
          class="mt-3"
          outlined
          @click="router.push('/challenges')"
        />
      </div>

      <DataTable
        v-else
        :value="enrollments.myList"
        :rows="enrollments.myList.length"
        striped-rows
        row-hover
        class="mt-4"
        @row-click="onRowClick"
      >
        <Column field="challenge.title" header="Title">
          <template #body="{ data }">
            <span class="font-medium text-slate-900">{{ data.challenge.title }}</span>
          </template>
        </Column>
        <Column header="Skills">
          <template #body="{ data }">
            <div class="flex flex-wrap gap-1">
              <Tag
                v-for="skill in data.challenge.requiredSkills"
                :key="skill"
                :value="skill"
                severity="info"
              />
            </div>
          </template>
        </Column>
        <Column header="Deadline">
          <template #body="{ data }">
            {{ formatDate(data.challenge.deadline) }}
          </template>
        </Column>
        <Column header="Status">
          <template #body="{ data }">
            <Tag :value="data.status" :severity="statusSeverity(data.status)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="text-lg font-semibold text-slate-900">Recent Activity</h2>
      <p class="mt-1 text-sm text-slate-600">Your latest actions on the platform.</p>
      <ActivityTimeline :events="activity.mine" class="mt-4" />
    </div>
  </div>
</template>

<style scoped>
:deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}
</style>
