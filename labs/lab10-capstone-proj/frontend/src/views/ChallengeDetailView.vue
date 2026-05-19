<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MdPreview } from 'md-editor-v3'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { deleteChallenge, getChallenge } from '@/api/challenges'
import { useAuthStore } from '@/stores/auth'
import type { Challenge } from '@/api/types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const confirm = useConfirm()
const toast = useToast()

const challenge = ref<Challenge | null>(null)
const loading = ref(true)
const notFound = ref(false)

const isOwner = computed(
  () => !!auth.user && !!challenge.value && auth.user.id === challenge.value.ownerId,
)

const formattedDeadline = computed(() =>
  challenge.value ? new Date(challenge.value.deadline).toLocaleString() : '',
)

const enrollmentSummary = computed(() => {
  if (!challenge.value) return ''
  const max = challenge.value.maxEnrollments ?? '—'
  return `${challenge.value.enrollmentsCount}/${max}`
})

async function load() {
  const id = route.params.id as string
  loading.value = true
  notFound.value = false
  try {
    challenge.value = await getChallenge(id)
  } catch (err) {
    const status =
      (err as { response?: { status?: number } }).response?.status
    if (status === 404) {
      notFound.value = true
    } else {
      toast.add({
        severity: 'error',
        summary: 'Could not load challenge',
        detail: 'Please try again later.',
        life: 4000,
      })
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

function onEdit() {
  if (!challenge.value) return
  void router.push(`/challenges/${challenge.value.id}/edit`)
}

function onDelete() {
  if (!challenge.value) return
  confirm.require({
    message: `Delete "${challenge.value.title}"? This cannot be undone from the UI.`,
    header: 'Delete challenge',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete',
    rejectLabel: 'Cancel',
    acceptClass: 'p-button-danger',
    accept: () => {
      void performDelete()
    },
  })
}

async function performDelete() {
  if (!challenge.value) return
  try {
    await deleteChallenge(challenge.value.id)
    toast.add({
      severity: 'success',
      summary: 'Challenge deleted',
      life: 3000,
    })
    void router.push('/challenges')
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Delete failed',
      detail: (err as Error).message,
      life: 4000,
    })
  }
}
</script>

<template>
  <div class="space-y-5">
    <Skeleton v-if="loading" height="3rem" />
    <div v-else-if="notFound" class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 class="text-xl font-semibold text-slate-900">Challenge not found</h1>
      <p class="mt-2 text-sm text-slate-600">
        It may have been deleted, or the link is incorrect.
      </p>
      <Button label="Back to challenges" class="mt-4" @click="router.push('/challenges')" />
    </div>
    <template v-else-if="challenge">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900 sm:text-3xl">{{ challenge.title }}</h1>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Tag :value="challenge.status" :severity="challenge.status === 'open' ? 'success' : 'secondary'" />
            <span>·</span>
            <span>Deadline: {{ formattedDeadline }}</span>
            <span>·</span>
            <span>Enrolled: {{ enrollmentSummary }}</span>
          </div>
        </div>
        <div v-if="isOwner" class="flex gap-2 self-start sm:self-auto">
          <Button label="Edit" icon="pi pi-pencil" outlined @click="onEdit" />
          <Button
            label="Delete"
            icon="pi pi-trash"
            severity="danger"
            outlined
            @click="onDelete"
          />
        </div>
      </div>

      <div v-if="challenge.requiredSkills.length" class="flex flex-wrap gap-1">
        <Tag v-for="skill in challenge.requiredSkills" :key="skill" :value="skill" severity="info" />
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <MdPreview :model-value="challenge.description" />
      </div>
    </template>
  </div>
</template>
