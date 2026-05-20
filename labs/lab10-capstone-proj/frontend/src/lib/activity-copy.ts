import type { ActivityEvent } from '@/api/types'

export interface ActivityCopy {
  icon: string
  text: string
  challengeId: string | null
  challengeTitle: string | null
}

export function eventCopy(event: ActivityEvent): ActivityCopy {
  const actor = event.user.name || 'Someone'
  switch (event.type) {
    case 'challenge_created':
      return {
        icon: 'pi pi-flag',
        text: `${actor} created`,
        challengeId: event.payload.challengeId,
        challengeTitle: event.payload.challengeTitle,
      }
    case 'enrolled':
      return {
        icon: 'pi pi-user-plus',
        text: `${actor} enrolled in`,
        challengeId: event.payload.challengeId,
        challengeTitle: event.payload.challengeTitle,
      }
    case 'submitted':
      return {
        icon: 'pi pi-upload',
        text: `${actor} submitted to`,
        challengeId: event.payload.challengeId,
        challengeTitle: event.payload.challengeTitle,
      }
    case 'approved':
      return {
        icon: 'pi pi-check-circle',
        text: `${actor}'s submission was approved for`,
        challengeId: event.payload.challengeId,
        challengeTitle: event.payload.challengeTitle,
      }
    case 'rejected':
      return {
        icon: 'pi pi-times-circle',
        text: `${actor}'s submission was rejected for`,
        challengeId: event.payload.challengeId,
        challengeTitle: event.payload.challengeTitle,
      }
  }
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  const diffMs = now.getTime() - then
  const seconds = Math.round(diffMs / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds} seconds ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.round(months / 12)
  return `${years} year${years === 1 ? '' : 's'} ago`
}
