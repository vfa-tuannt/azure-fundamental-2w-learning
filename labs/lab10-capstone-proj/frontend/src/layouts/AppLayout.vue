<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Drawer from 'primevue/drawer'
import Menu from 'primevue/menu'
import type { MenuItem } from 'primevue/menuitem'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const drawerOpen = ref(false)
const userMenu = ref<InstanceType<typeof Menu> | null>(null)

interface NavItem {
  label: string
  icon: string
  to: string
}

const navItems: NavItem[] = [
  { label: 'Challenges', icon: 'pi pi-list', to: '/challenges' },
  { label: 'My Profile', icon: 'pi pi-user', to: '/me' },
]

const userInitials = computed(() => {
  const name = auth.user?.name ?? ''
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
})

const userMenuItems = computed<MenuItem[]>(() => [
  {
    label: auth.user?.email ?? '',
    disabled: true,
  },
  { separator: true },
  {
    label: 'Sign out',
    icon: 'pi pi-sign-out',
    command: () => auth.logout(),
  },
])

function goTo(to: string) {
  drawerOpen.value = false
  void router.push(to)
}

function toggleUserMenu(event: Event) {
  userMenu.value?.toggle(event)
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-slate-50">
    <header
      class="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-4 md:px-6"
    >
      <div class="flex items-center gap-2">
        <Button
          icon="pi pi-bars"
          text
          rounded
          severity="secondary"
          aria-label="Open menu"
          class="md:!hidden"
          @click="drawerOpen = true"
        />
        <RouterLink
          to="/challenges"
          class="text-base font-semibold tracking-tight text-slate-900 sm:text-lg"
        >
          SkillChallenge
        </RouterLink>
      </div>

      <div class="flex items-center gap-2">
        <span class="hidden text-sm text-slate-700 sm:inline">{{ auth.user?.name }}</span>
        <button
          type="button"
          class="flex items-center"
          aria-label="User menu"
          @click="toggleUserMenu"
        >
          <Avatar
            v-if="auth.user?.avatarUrl"
            :image="auth.user.avatarUrl"
            shape="circle"
          />
          <Avatar v-else :label="userInitials || '?'" shape="circle" />
        </button>
        <Menu ref="userMenu" :model="userMenuItems" popup :pt="{ root: { class: 'min-w-52' } }" />
      </div>
    </header>

    <div class="flex flex-1 min-h-0">
      <aside
        class="hidden border-r border-slate-200 bg-white md:flex md:w-60 md:shrink-0 md:flex-col"
      >
        <nav class="flex flex-col gap-1 p-3">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            active-class="!bg-primary-50 !text-primary-700"
          >
            <i :class="item.icon" class="text-base" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>
      </aside>

      <Drawer
        v-model:visible="drawerOpen"
        position="left"
        :pt="{ root: { class: 'w-72 max-w-[80vw]' } }"
      >
        <template #header>
          <span class="text-base font-semibold text-slate-900">Menu</span>
        </template>
        <nav class="flex flex-col gap-1">
          <button
            v-for="item in navItems"
            :key="item.to"
            type="button"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
            @click="goTo(item.to)"
          >
            <i :class="item.icon" class="text-base" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </Drawer>

      <main class="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div class="mx-auto w-full max-w-6xl">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>
