import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ChevronDown, MapPin, ShoppingBasket, UserRound } from 'lucide-react'
import {
  useGetUserNotificationsQuery,
  useMarkAllUserNotificationsReadMutation,
  useMarkUserNotificationReadMutation,
} from '../../api/api.js'
import { capitalizeFirstLetter, getErrorMessage } from '../utils.js'

export default function Header({ cartCount, onOpenCart, onChooseStore, onLogin, onCartError }) {
  const navigate = useNavigate()
  const notificationMenuRef = useRef(null)
  const [openNotificationsForUser, setOpenNotificationsForUser] = useState(null)
  const [notificationActionError, setNotificationActionError] = useState('')
  const selectedStore = useSelector((state) => state.selectedStore)
  const user = useSelector((state) => state.auth.user)
  const notificationsOpen = Boolean(user?._id && openNotificationsForUser === user._id)
  const { data: notificationResponse, isLoading: notificationsLoading, error: notificationsError } = useGetUserNotificationsQuery(
    { page: 1, limit: 8 },
    { skip: !user, pollingInterval: user ? 30000 : 0 }
  )
  const [markNotificationRead] = useMarkUserNotificationReadMutation()
  const [markAllNotificationsRead, markAllNotificationsState] = useMarkAllUserNotificationsReadMutation()
  const unreadCount = notificationResponse?.unreadCount || 0
  const notifications = notificationResponse?.data || []

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!notificationMenuRef.current?.contains(event.target)) setOpenNotificationsForUser(null)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpenNotificationsForUser(null)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  async function openOrderNotification(notification) {
    if (!notification.readAt) {
      setNotificationActionError('')
      try {
        await markNotificationRead(notification._id).unwrap()
      } catch (requestError) {
        setNotificationActionError(getErrorMessage(requestError))
        return
      }
    }
    setOpenNotificationsForUser(null)
    navigate(`/orders?order=${notification.orderId}`)
  }

  async function markAllRead() {
    setNotificationActionError('')
    try {
      await markAllNotificationsRead().unwrap()
    } catch (requestError) {
      setNotificationActionError(getErrorMessage(requestError))
    }
  }

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2.5 sm:px-6 sm:py-3.5 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5" aria-label="NalliBokka home">
          <img src="/nallibokka-logo.png" alt="" className="h-10 w-10 object-contain sm:h-11 sm:w-11" />
          <span className="leading-tight">
            <span className="block text-[19px] font-bold tracking-[-.04em] text-[#b42332] sm:text-[22px]">Nalli<span className="text-[#1d3028]">Bokka</span></span>
            <span className="block text-[8px] font-semibold uppercase tracking-[.18em] text-[var(--text-secondary)] sm:text-[9px]">Fresh meat • Fresh living</span>
          </span>
        </Link>

        {/* Right side: notification bell + store selector */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Notification bell */}
          {user && <div ref={notificationMenuRef} className="relative">
            <button type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={notificationsOpen} aria-haspopup="dialog" onClick={() => { setNotificationActionError(''); setOpenNotificationsForUser((openUserId) => openUserId === user._id ? null : user._id) }} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e7e3d9] text-[var(--text-secondary)] transition hover:bg-[var(--status-danger-soft)]">
              <Bell size={18} />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[var(--brand-primary)] px-1 text-[9px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            {notificationsOpen && <section role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-[4.5rem] z-50 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-app)] shadow-[0_18px_48px_-20px_rgba(48,36,31,.35)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:max-h-[min(70vh,32rem)] sm:w-[min(22rem,calc(100vw-1.5rem))]">
              <div className="flex items-center justify-between border-b border-[var(--surface-subtle)] px-4 py-3">
                <div><h2 className="text-sm font-semibold text-[var(--text-primary)]">Notifications</h2><p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{unreadCount} unread</p></div>
                {unreadCount > 0 && <button type="button" disabled={markAllNotificationsState.isLoading} onClick={markAllRead} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--brand-primary)] disabled:opacity-50"><CheckCheck size={13} />Mark all read</button>}
              </div>
              {notificationActionError && <p role="alert" className="mx-3 mt-3 rounded-lg bg-[var(--status-danger-soft)] p-2.5 text-xs text-[var(--status-danger)]">{notificationActionError}</p>}
              {notificationsError
                ? <p role="alert" className="p-4 text-xs text-[var(--status-danger)]">Couldn't load notifications: {getErrorMessage(notificationsError)}</p>
                : notificationsLoading
                  ? <p role="status" className="p-5 text-center text-xs text-[var(--text-secondary)]">Loading notifications…</p>
                  : notifications.length
                    ? <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto sm:max-h-[min(65vh,26rem)]">
                      {notifications.map((notification) => <button key={notification._id} type="button" onClick={() => openOrderNotification(notification)} className={`block w-full border-b border-[var(--surface-subtle)] px-4 py-3 text-left transition hover:bg-[#fff8f4] last:border-0 ${notification.readAt ? '' : 'bg-[var(--bg-app)]'}`}>
                        <span className="flex items-start justify-between gap-3"><span className="text-xs font-semibold text-[var(--text-primary)]">{notification.title}</span>{!notification.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-primary)]" aria-label="Unread" />}</span>
                        <span className="mt-1 block text-[11px] leading-4 text-[var(--text-secondary)]">{notification.message}</span>
                        <span className="mt-1.5 block text-[10px] text-[var(--text-secondary)]">{new Date(notification.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · View order</span>
                      </button>)}
                    </div>
                    : <p className="px-4 py-8 text-center text-xs text-[var(--text-secondary)]">You're all caught up. Order updates will appear here.</p>}
            </section>}
          </div>}

          {/* Store selector pill */}
          <button onClick={onChooseStore} className="flex h-9 max-w-[140px] min-w-0 items-center gap-1.5 rounded-full border border-[#b8d7c2] bg-[#e7f3e9] px-2.5 text-left sm:max-w-none sm:gap-2 sm:px-3">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#d3e9d8] text-[var(--brand-primary)] sm:h-6 sm:w-6"><MapPin size={12} strokeWidth={2.2} /></span>
            <span className="min-w-0 flex items-center gap-0.5 truncate text-[12px] font-semibold text-[var(--brand-primary)] sm:text-sm">{capitalizeFirstLetter(selectedStore?.location || 'Choose store')} <ChevronDown size={12} className="shrink-0" /></span>
          </button>

          {/* Desktop nav */}
          <nav className="ml-2 hidden items-center gap-7 text-[13px] font-medium md:flex">
            {user && <NavLink to="/orders" className={({ isActive }) => isActive ? 'text-[var(--brand-primary)]' : 'text-[var(--text-secondary)] transition hover:text-[var(--text-secondary)]'}>Orders</NavLink>}
            {user ? (
              <NavLink to="/profile" className="flex items-center gap-2 text-[var(--text-secondary)]"><UserRound size={16} strokeWidth={1.7} /> {user.name?.split(' ')[0] || 'Account'}</NavLink>
            ) : (
              <button onClick={onLogin} className="flex items-center gap-2 text-[var(--text-secondary)]"><UserRound size={16} strokeWidth={1.7} /> Sign in</button>
            )}
          </nav>
          <button disabled={selectedStore?.isOpen === false} onClick={onOpenCart} aria-label="Open basket" className="ml-0 hidden h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--border-default)] bg-white px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex sm:px-3.5 md:ml-0">
            <ShoppingBasket size={17} strokeWidth={1.7} />
            <span className="hidden sm:inline">Basket</span>
            <span className="grid min-w-5 place-items-center rounded-full bg-[#f2e0dc] px-1 text-[10px] font-semibold text-[var(--brand-primary)]">{cartCount}</span>
          </button>
        </div>
      </div>
      {onCartError && <p role="status" className="mx-auto max-w-7xl px-5 pb-2 text-xs text-rose-700">{onCartError}</p>}
    </header>
  )
}
