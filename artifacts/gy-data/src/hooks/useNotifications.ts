/**
 * useNotifications — abstraction layer over the notification data source.
 *
 * All notification UI (NotificationsScreen, badges) MUST consume this hook
 * exclusively rather than reading AppContext directly. This boundary means
 * the data source — currently AppContext backed by the REST API — can be
 * swapped for push notifications (FCM, APNs), WebSockets, or any other
 * delivery mechanism without touching any UI component.
 *
 * To migrate to a push-notification backend:
 *   1. Replace the AppContext calls below with your new service calls.
 *   2. Map the new notification shape to the local `Notification` type.
 *   3. Done — NotificationsScreen and all badges update automatically.
 */
import { useAppContext } from '../context/AppContext';
import type { Notification } from '../data/mockData';

export interface NotificationActions {
  notifications: Notification[];
  unreadCount:   number;
  /** Mark every notification as read. */
  markAllRead:   () => Promise<void>;
  /** Mark a single notification as read by id. */
  markRead:      (id: string) => Promise<void>;
  /** Delete a single notification by id. */
  remove:        (id: string) => Promise<void>;
  /** Delete all notifications for the current user. */
  clearAll:      () => Promise<void>;
}

export function useNotifications(): NotificationActions {
  const {
    notifications,
    unreadCount,
    markAllNotificationsRead,
    markNotificationRead,
    deleteNotification,
    clearAllNotifications,
  } = useAppContext();

  return {
    notifications,
    unreadCount,
    markAllRead: markAllNotificationsRead,
    markRead:    markNotificationRead,
    remove:      deleteNotification,
    clearAll:    clearAllNotifications,
  };
}
