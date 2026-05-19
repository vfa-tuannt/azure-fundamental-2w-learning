<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MdPreview } from 'md-editor-v3'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { deleteChallenge, getChallenge } from '@/api/challenges'
import { useAuthStore } from '@/stores/auth'
import { useEnrollmentsStore } from '@/stores/enrollments'
import type { Challenge } from '@/api/types'

type ButtonState =
  | 'owner-hint'
  | 'sign-in-cta'
  | 'enroll-enabled'
  | 'full-disabled'
  | 'closed-disabled'
  | 'withdraw-enabled'
  | 'terminal-submitted'
  | 'terminal-approved'
  | 'terminal-rejected'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const enrollments = useEnrollmentsStore()
const confirm = useConfirm()
const toast = useToast()

const challenge = ref<Challenge | null>(null)
const loading = ref(true)
const notFound = ref(false)
const enrolling = ref(false)

const isOwner = computed(
  () =>
    !!auth.user &&
    !!challenge.value &&
    auth.user.id === challenge.value.ownerId,
)

const myEnrollment = computed(() => {
  if (!challenge.value) return null
  return enrollments.byChallengeId.get(challenge.value.id) ?? null
})

const buttonState = computed<ButtonState>(() => {
  if (!challenge.value) return 'sign-in-cta'
  if (isOwner.value) return 'owner-hint'
  if (!auth.isAuthenticated) return 'sign-in-cta'
  const e = myEnrollment.value
  if (e) {
    if (e.status === 'in_progress') return 'withdraw-enabled'
    if (e.status === 'submitted') return 'terminal-submitted'
    if (e.status === 'approved') return 'terminal-approved'
    return 'terminal-rejected'
  }
  if (challenge.value.status === 'closed') return 'closed-disabled'
  const max = challenge.value.maxEnrollments
  if (max !== null && challenge.value.enrollmentsCount >= max)
    return 'full-disabled'
  return 'enroll-enabled'
})

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
    if (auth.isAuthenticated && !isOwner.value) {
      await enrollments.loadForChallenge(id)
    }
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
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

watch(
  () => route.params.id,
  () => {
    void load()
  },
)

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

function extractApiMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } } }
  const msg = e.response?.data?.message
  if (Array.isArray(msg)) return msg.join(', ')
  return msg || (err as Error).message || 'Please try again.'
}

async function onEnroll() {
  if (!challenge.value) return
  enrolling.value = true
  try {
    await enrollments.enroll(challenge.value.id)
    challenge.value.enrollmentsCount += 1
    toast.add({
      severity: 'success',
      summary: 'Enrolled in challenge',
      life: 3000,
    })
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Could not enroll',
      detail: extractApiMessage(err),
      life: 4000,
    })
  } finally {
    enrolling.value = false
  }
}

function onWithdraw() {
  if (!challenge.value) return
  confirm.require({
    message: 'Withdraw from this challenge?',
    header: 'Withdraw',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Withdraw',
    rejectLabel: 'Cancel',
    acceptClass: 'p-button-danger',
    accept: () => {
      void performWithdraw()
    },
  })
}

async function performWithdraw() {
  if (!challenge.value) return
  enrolling.value = true
  try {
    await enrollments.withdraw(challenge.value.id)
    if (challenge.value.enrollmentsCount > 0) {
      challenge.value.enrollmentsCount -= 1
    }
    toast.add({
      severity: 'success',
      summary: 'Withdrew from challenge',
      life: 3000,
    })
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Could not withdraw',
      detail: extractApiMessage(err),
      life: 4000,
    })
  } finally {
    enrolling.value = false
  }
}

function onSignIn() {
  auth.login()
}
</script>

<template>
  <div class="space-y-5">
    <Skeleton v-if="loading" height="3rem" />
    <div
      v-else-if="notFound"
      class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
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
        <div class="flex flex-wrap gap-2 self-start sm:self-auto">
          <span
            v-if="buttonState === 'owner-hint'"
            class="inline-flex items-center rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600"
          >
            You own this challenge
          </span>
          <Button
            v-else-if="buttonState === 'sign-in-cta'"
            label="Sign in to enroll"
            icon="pi pi-sign-in"
            outlined
            @click="onSignIn"
          />
          <Button
            v-else-if="buttonState === 'enroll-enabled'"
            label="Enroll"
            icon="pi pi-user-plus"
            :loading="enrolling"
            @click="onEnroll"
          />
          <Button
            v-else-if="buttonState === 'full-disabled'"
            label="Full"
            icon="pi pi-ban"
            disabled
            v-tooltip.bottom="'This challenge has reached its enrollment cap'"
          />
          <Button
            v-else-if="buttonState === 'closed-disabled'"
            label="Closed"
            icon="pi pi-lock"
            disabled
            v-tooltip.bottom="'This challenge is no longer accepting enrollments'"
          />
          <Button
            v-else-if="buttonState === 'withdraw-enabled'"
            label="Withdraw"
            icon="pi pi-user-minus"
            severity="danger"
            outlined
            :loading="enrolling"
            @click="onWithdraw"
          />
          <Button
            v-else-if="buttonState === 'terminal-submitted'"
            label="Enrolled (Submitted)"
            icon="pi pi-clock"
            severity="warn"
            disabled
            v-tooltip.bottom="'Your submission is awaiting review'"
          />
          <Button
            v-else-if="buttonState === 'terminal-approved'"
            label="Enrolled (Approved)"
            icon="pi pi-check-circle"
            severity="success"
            disabled
            v-tooltip.bottom="'Your submission has been approved'"
          />
          <Button
            v-else-if="buttonState === 'terminal-rejected'"
            label="Enrolled (Rejected)"
            icon="pi pi-times-circle"
            severity="danger"
            disabled
            v-tooltip.bottom="'Your submission was rejected'"
          />
          <template v-if="isOwner">
            <Button label="Edit" icon="pi pi-pencil" outlined @click="onEdit" />
            <Button
              label="Delete"
              icon="pi pi-trash"
              severity="danger"
              outlined
              @click="onDelete"
            />
          </template>
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
