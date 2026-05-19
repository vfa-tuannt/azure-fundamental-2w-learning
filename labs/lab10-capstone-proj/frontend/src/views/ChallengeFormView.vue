<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MdEditor } from 'md-editor-v3'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Chips from 'primevue/chips'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'
import {
  createChallenge,
  getChallenge,
  updateChallenge,
} from '@/api/challenges'
import type { CreateChallengeDto, UpdateChallengeDto } from '@/api/types'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const editId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' ? id : ''
})
const isEdit = computed(() => editId.value !== '')

const loading = ref(false)
const submitting = ref(false)

const title = ref('')
const description = ref('')
const requiredSkills = ref<string[]>([])
const deadline = ref<Date | null>(null)
const maxEnrollments = ref<number | null>(null)

const titleError = computed(() => (title.value.trim() === '' ? 'Title is required' : ''))
const deadlineError = computed(() => {
  if (!deadline.value) return 'Deadline is required'
  return deadline.value.getTime() <= Date.now() ? 'Deadline must be in the future' : ''
})
const isValid = computed(() => titleError.value === '' && deadlineError.value === '')

async function loadForEdit() {
  if (!isEdit.value) return
  loading.value = true
  try {
    const challenge = await getChallenge(editId.value)
    title.value = challenge.title
    description.value = challenge.description
    requiredSkills.value = [...challenge.requiredSkills]
    deadline.value = new Date(challenge.deadline)
    maxEnrollments.value = challenge.maxEnrollments
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404) {
      toast.add({ severity: 'error', summary: 'Challenge not found', life: 4000 })
      void router.push('/challenges')
    } else {
      toast.add({
        severity: 'error',
        summary: 'Could not load challenge',
        detail: (err as Error).message,
        life: 4000,
      })
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadForEdit()
})

function extractErrorMessage(err: unknown): string {
  const response = (err as { response?: { data?: { message?: unknown } } }).response
  const msg = response?.data?.message
  if (Array.isArray(msg)) return msg.join(', ')
  if (typeof msg === 'string') return msg
  return (err as Error).message
}

async function submit() {
  if (!isValid.value) return
  if (!deadline.value) return
  submitting.value = true
  try {
    if (isEdit.value) {
      const dto: UpdateChallengeDto = {
        title: title.value,
        description: description.value,
        requiredSkills: requiredSkills.value,
        deadline: deadline.value.toISOString(),
        maxEnrollments: maxEnrollments.value,
      }
      const saved = await updateChallenge(editId.value, dto)
      toast.add({ severity: 'success', summary: 'Challenge updated', life: 3000 })
      void router.push(`/challenges/${saved.id}`)
    } else {
      const dto: CreateChallengeDto = {
        title: title.value,
        description: description.value,
        requiredSkills: requiredSkills.value,
        deadline: deadline.value.toISOString(),
      }
      if (maxEnrollments.value !== null) {
        dto.maxEnrollments = maxEnrollments.value
      }
      const saved = await createChallenge(dto)
      toast.add({ severity: 'success', summary: 'Challenge created', life: 3000 })
      void router.push(`/challenges/${saved.id}`)
    }
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: isEdit.value ? 'Update failed' : 'Create failed',
      detail: extractErrorMessage(err),
      life: 5000,
    })
  } finally {
    submitting.value = false
  }
}

function cancel() {
  if (isEdit.value) {
    void router.push(`/challenges/${editId.value}`)
  } else {
    void router.push('/challenges')
  }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold text-slate-900 sm:text-3xl">
        {{ isEdit ? 'Edit challenge' : 'New challenge' }}
      </h1>
    </div>

    <Skeleton v-if="loading" height="3rem" />
    <form v-else class="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" @submit.prevent="submit">
      <div class="flex flex-col gap-1">
        <label for="title" class="text-sm font-medium text-slate-700">Title *</label>
        <InputText id="title" v-model="title" placeholder="Learn ARM templates" />
        <Message v-if="titleError" severity="error" :closable="false" size="small">{{ titleError }}</Message>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-slate-700">Description (markdown) *</label>
        <MdEditor v-model="description" language="en-US" />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-slate-700">Required skills</label>
        <Chips v-model="requiredSkills" placeholder="Add a skill and press Enter" />
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-slate-700">Deadline *</label>
          <DatePicker v-model="deadline" show-time hour-format="24" />
          <Message v-if="deadlineError" severity="error" :closable="false" size="small">{{ deadlineError }}</Message>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-slate-700">Max enrollments</label>
          <InputNumber v-model="maxEnrollments" :min="1" placeholder="Unlimited" show-buttons />
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <Button label="Cancel" severity="secondary" outlined type="button" @click="cancel" />
        <Button
          :label="isEdit ? 'Save changes' : 'Create challenge'"
          icon="pi pi-check"
          type="submit"
          :disabled="!isValid || submitting"
          :loading="submitting"
        />
      </div>
    </form>
  </div>
</template>
