import { createRouter, createWebHistory } from 'vue-router'
import { authGuard } from './guards'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/challenges',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('../views/AuthCallbackView.vue'),
      meta: { public: true },
    },
    {
      path: '/challenges',
      name: 'challenges',
      component: () => import('../views/ChallengesView.vue'),
      meta: { public: true },
    },
    {
      path: '/challenges/new',
      name: 'challenge-create',
      component: () => import('../views/ChallengeFormView.vue'),
    },
    {
      path: '/challenges/:id',
      name: 'challenge-detail',
      component: () => import('../views/ChallengeDetailView.vue'),
      meta: { public: true },
    },
    {
      path: '/challenges/:id/edit',
      name: 'challenge-edit',
      component: () => import('../views/ChallengeFormView.vue'),
    },
    {
      path: '/me',
      name: 'me',
      component: () => import('../views/MeView.vue'),
    },
  ],
})

router.beforeEach(authGuard)

export default router
