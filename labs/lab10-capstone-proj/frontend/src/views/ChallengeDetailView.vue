<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MdPreview } from 'md-editor-v3'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import FileUpload, { type FileUploadSelectEvent } from 'primevue/fileupload'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { deleteChallenge, getChallenge } from '@/api/challenges'
import { useAuthStore } from '@/stores/auth'
import { useEnrollmentsStore } from '@/stores/enrollments'
import { useReviewsStore } from '@/stores/reviews'
import { useSubmissionsStore } from '@/stores/submissions'
import type {
  Challenge,
  ChallengeSubmission,
  EnrollmentStatus,
} from '@/api/types'

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
const submissions = useSubmissionsStore()
const reviews = useReviewsStore()
const confirm = useConfirm()
const toast = useToast()

const expandedRejectRowId = ref<string | null>(null)
const rejectReasonInputs = reactive<Record<string, string>>({})
const reviewingId = ref<string | null>(null)

type StatusSeverity = 'info' | 'success' | 'danger' | 'secondary'
const STATUS_SEVERITY: Record<EnrollmentStatus, StatusSeverity> = {
  in_progress: 'secondary',
  submitted: 'info',
  approved: 'success',
  rejected: 'danger',
}
const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  in_progress: 'In progress',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
}

const challenge = ref<Challenge | null>(null)
const loading = ref(true)
const notFound = ref(false)
const enrolling = ref(false)
const submitting = ref(false)
const submitMode = ref<'file' | 'url'>('file')
const submitModeOptions = [
  { label: 'File', value: 'file' as const },
  { label: 'External URL', value: 'url' as const },
]
const selectedFile = ref<File | null>(null)
const externalUrlInput = ref('')
const notesInput = ref('')
const MAX_FILE_BYTES = 25 * 1024 * 1024
const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.zip,.md'

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

const canShowSubmitPanel = computed(
  () =>
    !!myEnrollment.value &&
    myEnrollment.value.status === 'in_progress' &&
    !isOwner.value,
)

const mySubmissions = computed(() => {
  const id = myEnrollment.value?.id
  if (!id) return []
  return submissions.byEnrollmentId.get(id) ?? []
})

const challengeSubmissions = computed<ChallengeSubmission[]>(() => {
  if (!challenge.value) return []
  return reviews.byChallengeId.get(challenge.value.id) ?? []
})

function rejectionBannerText(
  rejectionReason: string | null,
  reviewedAt: string | null,
  status: EnrollmentStatus,
): string | null {
  if (status !== 'rejected' || reviewedAt === null) return null
  return rejectionReason ?? 'Submission rejected — no reason provided'
}

const isFormValid = computed(() => {
  if (submitMode.value === 'file') {
    return !!selectedFile.value
  }
  if (!externalUrlInput.value) return false
  try {
    new URL(externalUrlInput.value)
    return true
  } catch {
    return false
  }
})

function fileLabel(blobUrl: string | null, externalUrl: string | null): string {
  if (blobUrl) {
    const last = blobUrl.split('/').pop() ?? ''
    return decodeURIComponent(last).replace(/^[0-9a-f-]{36}-/, '')
  }
  return externalUrl ?? ''
}

function formatSubmittedAt(value: string): string {
  return new Date(value).toLocaleString()
}

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
      const mine = enrollments.byChallengeId.get(id)
      if (mine) {
        await submissions.loadForEnrollment(mine.id)
      }
    }
    if (isOwner.value) {
      await reviews.loadForChallenge(id)
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

function onFileSelect(event: FileUploadSelectEvent) {
  const files = event.files as File[]
  selectedFile.value = files[0] ?? null
}

function onFileClear() {
  selectedFile.value = null
}

function resetSubmitForm() {
  selectedFile.value = null
  externalUrlInput.value = ''
  notesInput.value = ''
  submitMode.value = 'file'
}

async function onSubmit() {
  if (!challenge.value || !myEnrollment.value) return
  if (!isFormValid.value) {
    toast.add({
      severity: 'warn',
      summary:
        submitMode.value === 'file'
          ? 'Please select a file before submitting'
          : 'Please enter a valid URL before submitting',
      life: 3000,
    })
    return
  }

  const enrollmentId = myEnrollment.value.id
  submitting.value = true
  try {
    if (submitMode.value === 'file') {
      await submissions.createFileSubmission(
        enrollmentId,
        selectedFile.value!,
        notesInput.value || undefined,
      )
    } else {
      await submissions.createUrlSubmission(
        enrollmentId,
        externalUrlInput.value,
        notesInput.value || undefined,
      )
    }
    const updated = enrollments.byChallengeId.get(challenge.value.id)
    if (updated) {
      enrollments.byChallengeId.set(challenge.value.id, {
        ...updated,
        status: 'submitted',
      })
    }
    toast.add({
      severity: 'success',
      summary: 'Submission received',
      life: 3000,
    })
    resetSubmitForm()
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 422) {
      toast.add({
        severity: 'error',
        summary: 'File rejected',
        detail: extractApiMessage(err),
        life: 5000,
      })
    } else if (status === 409) {
      toast.add({
        severity: 'error',
        summary: 'This enrollment is no longer in progress',
        detail: 'Please refresh the page.',
        life: 5000,
      })
    } else {
      toast.add({
        severity: 'error',
        summary: 'Submission failed',
        detail: extractApiMessage(err),
        life: 5000,
      })
    }
  } finally {
    submitting.value = false
  }
}

async function handleReviewError(
  err: unknown,
  challengeId: string,
): Promise<void> {
  const status = (err as { response?: { status?: number } }).response?.status
  if (status === 409) {
    toast.add({
      severity: 'warn',
      summary: 'This submission was reviewed in another tab',
      detail: 'Refreshing the list to reconcile.',
      life: 4000,
    })
    try {
      await reviews.loadForChallenge(challengeId)
    } catch {
      // ignore reload errors; primary error is already surfaced
    }
    return
  }
  if (status === 403) {
    toast.add({
      severity: 'error',
      summary: 'Action not permitted',
      detail: extractApiMessage(err),
      life: 4000,
    })
    return
  }
  toast.add({
    severity: 'error',
    summary: 'Action failed',
    detail: extractApiMessage(err),
    life: 4000,
  })
}

async function onApprove(row: ChallengeSubmission) {
  if (!challenge.value) return
  const challengeId = challenge.value.id
  reviewingId.value = row.id
  try {
    await reviews.approve(challengeId, row.id)
    toast.add({
      severity: 'success',
      summary: 'Submission approved',
      life: 3000,
    })
  } catch (err) {
    await handleReviewError(err, challengeId)
  } finally {
    reviewingId.value = null
  }
}

function onRejectExpand(row: ChallengeSubmission) {
  if (expandedRejectRowId.value === row.id) {
    expandedRejectRowId.value = null
    return
  }
  expandedRejectRowId.value = row.id
  if (!(row.id in rejectReasonInputs)) {
    rejectReasonInputs[row.id] = ''
  }
}

function onRejectCancel(row: ChallengeSubmission) {
  expandedRejectRowId.value = null
  rejectReasonInputs[row.id] = ''
}

async function onRejectConfirm(row: ChallengeSubmission) {
  if (!challenge.value) return
  const challengeId = challenge.value.id
  const reasonRaw = rejectReasonInputs[row.id] ?? ''
  const reason = reasonRaw.trim().length > 0 ? reasonRaw : undefined
  reviewingId.value = row.id
  try {
    await reviews.reject(challengeId, row.id, reason)
    toast.add({
      severity: 'success',
      summary: 'Submission rejected',
      life: 3000,
    })
    expandedRejectRowId.value = null
    rejectReasonInputs[row.id] = ''
  } catch (err) {
    await handleReviewError(err, challengeId)
  } finally {
    reviewingId.value = null
  }
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

      <div
        v-if="canShowSubmitPanel"
        class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 class="text-lg font-semibold text-slate-900">Submit Output</h2>
        <p class="mt-1 text-sm text-slate-600">
          Upload your output file or share an external link. Allowed file types:
          PDF, PNG, JPG, ZIP, Markdown (max 25 MB).
        </p>

        <div class="mt-4 flex flex-col gap-4">
          <SelectButton
            v-model="submitMode"
            :options="submitModeOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
          />

          <FileUpload
            v-if="submitMode === 'file'"
            mode="advanced"
            :auto="false"
            :show-upload-button="false"
            :show-cancel-button="false"
            choose-label="Choose file"
            :accept="ACCEPTED_EXTENSIONS"
            :max-file-size="MAX_FILE_BYTES"
            :file-limit="1"
            :multiple="false"
            @select="onFileSelect"
            @clear="onFileClear"
            @remove="onFileClear"
          />

          <InputText
            v-else
            v-model="externalUrlInput"
            type="url"
            placeholder="https://github.com/example/repo"
          />

          <Textarea
            v-model="notesInput"
            rows="3"
            placeholder="Optional notes for the reviewer"
          />

          <div class="flex justify-end">
            <Button
              label="Submit"
              icon="pi pi-send"
              :loading="submitting"
              :disabled="!isFormValid"
              @click="onSubmit"
            />
          </div>
        </div>
      </div>

      <div
        v-if="mySubmissions.length > 0"
        class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 class="text-lg font-semibold text-slate-900">My Submissions</h2>
        <ul class="mt-3 space-y-3">
          <li
            v-for="submission in mySubmissions"
            :key="submission.id"
            class="rounded-md border border-slate-200 p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <a
                :href="submission.blobUrl ?? submission.externalUrl ?? '#'"
                target="_blank"
                rel="noopener"
                class="break-all text-sm font-medium text-blue-700 hover:underline"
              >
                {{ fileLabel(submission.blobUrl, submission.externalUrl) }}
              </a>
              <span class="shrink-0 text-xs text-slate-500">
                {{ formatSubmittedAt(submission.submittedAt) }}
              </span>
            </div>
            <p
              v-if="submission.notes"
              class="mt-1 text-sm text-slate-600 whitespace-pre-wrap"
            >
              {{ submission.notes }}
            </p>
            <Message
              v-if="
                myEnrollment &&
                rejectionBannerText(
                  submission.rejectionReason,
                  submission.reviewedAt,
                  myEnrollment.status,
                ) !== null
              "
              severity="error"
              :closable="false"
              class="mt-2"
            >
              {{
                rejectionBannerText(
                  submission.rejectionReason,
                  submission.reviewedAt,
                  myEnrollment.status,
                )
              }}
            </Message>
          </li>
        </ul>
      </div>

      <section
        v-if="isOwner"
        class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-900">
            Submissions ({{ challengeSubmissions.length }})
          </h2>
        </div>

        <div
          v-if="challengeSubmissions.length === 0"
          class="mt-4 rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
        >
          No submissions yet.
        </div>

        <DataTable
          v-else
          :value="challengeSubmissions"
          data-key="id"
          class="mt-4"
          striped-rows
        >
          <Column header="Submitter">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <Avatar
                  :image="data.submitter.avatarUrl ?? undefined"
                  :label="
                    data.submitter.avatarUrl
                      ? undefined
                      : data.submitter.name.charAt(0).toUpperCase()
                  "
                  shape="circle"
                  size="normal"
                />
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-slate-900">
                    {{ data.submitter.name }}
                  </span>
                  <span class="text-xs text-slate-500">
                    {{ data.submitter.email }}
                  </span>
                </div>
              </div>
            </template>
          </Column>
          <Column header="Submission">
            <template #body="{ data }">
              <a
                :href="data.blobUrl ?? data.externalUrl ?? '#'"
                target="_blank"
                rel="noopener"
                class="break-all text-sm font-medium text-blue-700 hover:underline"
              >
                {{ fileLabel(data.blobUrl, data.externalUrl) }}
              </a>
            </template>
          </Column>
          <Column header="Notes">
            <template #body="{ data }">
              <span
                v-if="data.notes"
                class="text-sm text-slate-600 whitespace-pre-wrap"
              >
                {{ data.notes }}
              </span>
              <span v-else class="text-xs text-slate-400">—</span>
            </template>
          </Column>
          <Column header="Submitted">
            <template #body="{ data }">
              <span class="text-xs text-slate-500">
                {{ formatSubmittedAt(data.submittedAt) }}
              </span>
            </template>
          </Column>
          <Column header="Status">
            <template #body="{ data }">
              <Tag
                :value="STATUS_LABEL[data.enrollment.status as EnrollmentStatus]"
                :severity="STATUS_SEVERITY[data.enrollment.status as EnrollmentStatus]"
              />
            </template>
          </Column>
          <Column header="Actions">
            <template #body="{ data }">
              <div
                v-if="data.enrollment.status === 'submitted'"
                class="flex flex-col gap-2"
              >
                <div class="flex gap-2">
                  <Button
                    label="Approve"
                    icon="pi pi-check"
                    severity="success"
                    size="small"
                    :loading="reviewingId === data.id"
                    @click="onApprove(data)"
                  />
                  <Button
                    :label="
                      expandedRejectRowId === data.id ? 'Close' : 'Reject'
                    "
                    icon="pi pi-times"
                    severity="danger"
                    size="small"
                    outlined
                    :disabled="reviewingId === data.id"
                    @click="onRejectExpand(data)"
                  />
                </div>
                <div
                  v-if="expandedRejectRowId === data.id"
                  class="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
                >
                  <label class="text-xs font-medium text-slate-700">
                    Reason (optional)
                  </label>
                  <Textarea
                    v-model="rejectReasonInputs[data.id]"
                    rows="3"
                    placeholder="Explain why this submission is rejected"
                    auto-resize
                  />
                  <div class="flex justify-end gap-2">
                    <Button
                      label="Cancel"
                      severity="secondary"
                      size="small"
                      outlined
                      @click="onRejectCancel(data)"
                    />
                    <Button
                      label="Reject"
                      icon="pi pi-times"
                      severity="danger"
                      size="small"
                      :loading="reviewingId === data.id"
                      @click="onRejectConfirm(data)"
                    />
                  </div>
                </div>
              </div>
              <span v-else class="text-xs text-slate-400">Reviewed</span>
            </template>
          </Column>
        </DataTable>
      </section>
    </template>
  </div>
</template>
