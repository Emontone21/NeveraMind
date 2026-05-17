// Local notifications for expiry reminders.
//
// We talk to the LocalNotifications plugin through Capacitor.Plugins instead
// of importing the @capacitor/local-notifications module. Why:
//   - The JS bundle stays buildable even if the package isn't installed in
//     node_modules yet (the build doesn't try to resolve a missing import).
//   - On native iOS, once you've installed the package and run `cap sync`,
//     the plugin is registered and Capacitor.Plugins.LocalNotifications
//     becomes available — same API surface as the npm wrapper provides.
//   - On web the plugin isn't registered, so every function is a no-op.
//
// Scheduling model:
//   - One notification per item with an `expires_at` in the future.
//   - Fires at 09:00 local time the day BEFORE expiry.
//   - Notification id = first 8 hex chars of the item UUID, parsed as int.
//     Collision risk is negligible for a single-user fridge.

import { Capacitor } from '@capacitor/core'
import { parseExpiry } from './expiry'

function getPlugin() {
  try {
    if (!Capacitor?.isPluginAvailable?.('LocalNotifications')) return null
    return Capacitor.Plugins?.LocalNotifications ?? null
  } catch {
    return null
  }
}

function notifIdFromUuid(uuid) {
  if (typeof uuid !== 'string') return 0
  const hex = uuid.replace(/-/g, '').slice(0, 8)
  const n = parseInt(hex, 16)
  return isNaN(n) ? 0 : n % 2_000_000_000
}

/** Returns true if the user granted permission. Safe to call repeatedly. */
export async function requestPermissions() {
  const plugin = getPlugin()
  if (!plugin) return false
  try {
    const { display } = await plugin.checkPermissions()
    if (display === 'granted') return true
    if (display === 'denied') return false
    const res = await plugin.requestPermissions()
    return res.display === 'granted'
  } catch (err) {
    console.warn('[notifications] permission error:', err?.message || err)
    return false
  }
}

/**
 * Build the schedule date: 09:00 local time on (expires_at - 1 day).
 * Returns null when the item shouldn't get a notification.
 */
function reminderDate(item, now = new Date()) {
  const expiry = parseExpiry(item?.expires_at)
  if (!expiry) return null
  if (item.status !== 'disponible') return null

  const remind = new Date(expiry)
  remind.setDate(remind.getDate() - 1)
  remind.setHours(9, 0, 0, 0)

  if (remind.getTime() <= now.getTime()) return null
  return remind
}

/**
 * Schedule (or replace) the notification for a single item.
 * No-op when the plugin isn't available or the item doesn't qualify.
 */
export async function scheduleExpiryNotification(item) {
  const plugin = getPlugin()
  if (!plugin || !item?.id) return

  const id = notifIdFromUuid(item.id)
  const at = reminderDate(item)

  try {
    // Always cancel the previous one first; schedule() doesn't replace by id.
    await plugin.cancel({ notifications: [{ id }] }).catch(() => {})

    if (!at) return

    await plugin.schedule({
      notifications: [
        {
          id,
          title: '🥦 NeveraMind',
          body: `${item.name} vence mañana`,
          schedule: { at, allowWhileIdle: true },
          extra: { itemId: item.id },
        },
      ],
    })
  } catch (err) {
    console.warn('[notifications] schedule failed:', err?.message || err)
  }
}

export async function cancelNotificationForItem(itemId) {
  const plugin = getPlugin()
  if (!plugin || !itemId) return
  try {
    await plugin.cancel({ notifications: [{ id: notifIdFromUuid(itemId) }] })
  } catch (err) {
    console.warn('[notifications] cancel failed:', err?.message || err)
  }
}

/**
 * Reconcile all scheduled notifications against the current item list.
 * Call after bulk operations (initial load, scanner confirm).
 *
 * Strategy: cancel every pending notification we own, then re-schedule the
 * ones that still qualify. Simpler and safer than diffing.
 */
export async function syncNotifications(items) {
  const plugin = getPlugin()
  if (!plugin || !Array.isArray(items)) return

  try {
    const { notifications: pending } = await plugin.getPending()
    if (pending?.length) {
      await plugin.cancel({
        notifications: pending.map((n) => ({ id: n.id })),
      })
    }
  } catch (err) {
    console.warn('[notifications] getPending failed:', err?.message || err)
  }

  const toSchedule = items
    .map((item) => {
      const at = reminderDate(item)
      if (!at) return null
      return {
        id: notifIdFromUuid(item.id),
        title: '🥦 NeveraMind',
        body: `${item.name} vence mañana`,
        schedule: { at, allowWhileIdle: true },
        extra: { itemId: item.id },
      }
    })
    .filter(Boolean)

  if (toSchedule.length === 0) return

  try {
    await plugin.schedule({ notifications: toSchedule })
  } catch (err) {
    console.warn('[notifications] bulk schedule failed:', err?.message || err)
  }
}
