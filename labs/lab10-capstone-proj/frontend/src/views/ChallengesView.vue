<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import DataTable, { type DataTablePageEvent, type DataTableRowClickEvent } from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ActivityTimeline from '@/components/ActivityTimeline.vue'
import { useActivityStore } from '@/stores/activity'
import { useChallengesStore } from '@/stores/challenges'
import { useAuthStore } from '@/stores/auth'
import type { Challenge, ChallengeStatus } from '@/api/types'

const router = useRouter()
const store = useChallengesStore()
const auth = useAuthStore()
const activity = useActivityStore()

const skillInput = ref('')
const statusInput = ref<ChallengeStatus | null>(null)

const statusOptions: Array<{ label: string; value: ChallengeStatus | null }> = [
  { label: 'All', value: null },
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
]

onMounted(() => {
  skillInput.value = store.filters.skill
  statusInput.value = store.filters.status
  void store.fetchList()
  activity.startGlobalPolling()
})

onUnmounted(() => {
  activity.stopGlobalPolling()
})

let skillTimer: ReturnType<typeof setTimeout> | undefined
watch(skillInput, (next) => {
  if (skillTimer) clearTimeout(skillTimer)
  skillTimer = setTimeout(() => {
    void store.setFilters({ skill: next })
  }, 350)
})

watch(statusInput, (next) => {
  void store.setFilters({ status: next })
})

function onPage(event: DataTablePageEvent) {
  void store.setPage(event.page + 1)
}

function onRowClick(event: DataTableRowClickEvent) {
  const challenge = event.data as Challenge
  void router.push(`/challenges/${challenge.id}`)
}

function goCreate() {
  void router.push('/challenges/new')
}

function statusSeverity(status: ChallengeStatus): 'success' | 'secondary' {
  return status === 'open' ? 'success' : 'secondary'
}

function formatDeadline(value: string): string {
  return new Date(value).toLocaleDateString()
}
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
      <Button
        v-if="auth.isAuthenticated"
        label="Create Challenge"
        icon="pi pi-plus"
        class="self-start sm:self-auto"
        @click="goCreate"
      />
    </div>

    <div class="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
      <span class="text-sm font-medium text-slate-700">Filters</span>
      <InputText
        v-model="skillInput"
        placeholder="Skill (e.g. azure)"
        class="sm:w-64"
      />
      <Select
        v-model="statusInput"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        placeholder="Status"
        class="sm:w-44"
      />
    </div>

    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="text-lg font-semibold text-slate-900">Org-wide Activity</h2>
      <p class="mt-1 text-sm text-slate-600">
        What's happening across the platform, refreshed every 30 seconds.
      </p>
      <ActivityTimeline :events="activity.recent" class="mt-4" />
    </div>

    <Message v-if="store.error" severity="error" :closable="false">{{ store.error }}</Message>

    <DataTable
      :value="store.items"
      :loading="store.loading"
      lazy
      paginator
      :rows="store.limit"
      :total-records="store.total"
      :first="(store.page - 1) * store.limit"
      data-key="id"
      row-hover
      class="rounded-lg border border-slate-200 bg-white shadow-sm"
      @page="onPage"
      @row-click="onRowClick"
    >
      <template #empty>
        <div class="py-8 text-center text-sm text-slate-500">No challenges match your filters.</div>
      </template>
      <Column field="title" header="Title" />
      <Column header="Skills">
        <template #body="{ data }: { data: Challenge }">
          <div class="flex flex-wrap gap-1">
            <Tag v-for="skill in data.requiredSkills" :key="skill" :value="skill" severity="info" />
          </div>
        </template>
      </Column>
      <Column header="Deadline">
        <template #body="{ data }: { data: Challenge }">
          {{ formatDeadline(data.deadline) }}
        </template>
      </Column>
      <Column header="Enrolled / Max">
        <template #body="{ data }: { data: Challenge }">
          {{ data.enrollmentsCount }}/{{ data.maxEnrollments ?? '—' }}
        </template>
      </Column>
      <Column header="Status">
        <template #body="{ data }: { data: Challenge }">
          <Tag :value="data.status" :severity="statusSeverity(data.status)" />
        </template>
      </Column>
    </DataTable>
  </div>
</template>
