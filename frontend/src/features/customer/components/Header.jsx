import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ChevronDown, MapPin, ShoppingBasket, UserRound, X } from 'lucide-react'
import {
  useGetUserNotificationsQuery,
  useMarkAllUserNotificationsReadMutation,
  useMarkUserNotificationReadMutation,
} from '../../api/api.js'
import { capitalizeFirstLetter, getErrorMessage } from '../utils.js'
import { useLanguage, useTranslation } from '../../i18n/LanguageContext.js'

export default function Header({ cartCount, onOpenCart, onChooseStore, onLogin, onCartError }) {
  const t = useTranslation()
  const { language } = useLanguage()
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

  function openOrderNotification(notification) {
    if (!notification.readAt) {
      setNotificationActionError('')
      markNotificationRead(notification._id)
        .unwrap()
        .catch((requestError) => setNotificationActionError(getErrorMessage(requestError)))
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
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3.5 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5" aria-label={`NalliBokka ${t('Home')}`}>
          <img src="/nallibokka-logo.png" alt="" className="h-10 w-10 shrink-0 object-contain sm:h-13 sm:w-13" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[18px] font-bold tracking-[-.04em] text-[var(--brand-primary)] sm:text-[22px]">NalliBokka</span>
            <span className="block truncate text-[8px] font-semibold tracking-[.04em] text-[var(--text-secondary)] sm:text-[9px] sm:tracking-[.08em]">Mana oori angadi</span>
          </span>
        </Link>

        {/* Right side: notification bell + store selector */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Notification bell */}
          {user && <div ref={notificationMenuRef} className="relative">
            <button type="button" aria-label={`${t(notificationsOpen ? 'Close notifications' : 'Open notifications')}${unreadCount ? `, ${unreadCount} ${t('unread notifications')}` : ''}`} aria-expanded={notificationsOpen} aria-controls="customer-notifications-panel" aria-haspopup="dialog" onClick={() => { setNotificationActionError(''); setOpenNotificationsForUser((openUserId) => openUserId === user._id ? null : user._id) }} className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${notificationsOpen ? 'border-[var(--brand-secondary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)] shadow-sm' : 'border-[#e7e3d9] text-[var(--text-secondary)] hover:bg-[var(--brand-primary-soft)]'}`}>
              <Bell size={18} className={notificationsOpen ? 'scale-110 transition-transform' : 'transition-transform'} />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[var(--brand-primary)] px-1 text-[9px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            {notificationsOpen && <>
              <button type="button" aria-label={t('Close notifications')} onClick={() => setOpenNotificationsForUser(null)} className="fixed inset-0 z-40 bg-[#17241f]/20 backdrop-blur-[1px] sm:hidden" />
              <section id="customer-notifications-panel" role="dialog" aria-label={t('Notifications')} className="notification-panel-enter fixed inset-x-3 top-[4.5rem] z-50 flex max-h-[min(58dvh,30rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-app)] shadow-[0_18px_48px_-20px_rgba(48,36,31,.35)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:max-h-[min(70vh,32rem)] sm:w-[min(22rem,calc(100vw-1.5rem))]">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--surface-subtle)] px-4 py-3">
                <div><h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('Notifications')}</h2><p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{unreadCount} {t('unread')}</p></div>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && <button type="button" disabled={markAllNotificationsState.isLoading} onClick={markAllRead} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--brand-primary)] disabled:opacity-50"><CheckCheck size={13} />{t('Mark all read')}</button>}
                  <button type="button" onClick={() => setOpenNotificationsForUser(null)} aria-label={t('Close notifications')} className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-secondary)] transition hover:bg-white hover:text-[var(--text-primary)] sm:hidden"><X size={16} /></button>
                </div>
              </div>
              {notificationActionError && <p role="alert" className="mx-3 mt-3 rounded-lg bg-[var(--status-danger-soft)] p-2.5 text-xs text-[var(--status-danger)]">{notificationActionError}</p>}
              {notificationsError
                ? <p role="alert" className="p-4 text-xs text-[var(--status-danger)]">{t("Couldn't load notifications")}: {getErrorMessage(notificationsError)}</p>
                : notificationsLoading
                  ? <p role="status" className="p-5 text-center text-xs text-[var(--text-secondary)]">{t('Loading notifications…')}</p>
                  : notifications.length
                    ? <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                      {notifications.map((notification) => <button key={notification._id} type="button" onClick={() => openOrderNotification(notification)} className={`block w-full border-b border-[var(--surface-subtle)] px-4 py-3 text-left transition hover:bg-[#fff8f4] last:border-0 ${notification.readAt ? '' : 'bg-[var(--bg-app)]'}`}>
                        <span className="flex items-start justify-between gap-3"><span className="text-xs font-semibold text-[var(--text-primary)]">{t(notification.title)}</span>{!notification.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-primary)]" aria-label={t('Unread')} />}</span>
                        <span className="mt-1 block text-[11px] leading-4 text-[var(--text-secondary)]">{t(notification.message)}</span>
                        <span className="mt-1.5 block text-[10px] text-[var(--text-secondary)]">{new Date(notification.createdAt).toLocaleString(language === 'te' ? 'te-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {t('View order')}</span>
                      </button>)}
                    </div>
                    : <p className="px-4 py-8 text-center text-xs text-[var(--text-secondary)]">{t("You're all caught up. Order updates will appear here.")}</p>}
              </section>
            </>}
          </div>}

          {/* Store selector pill */}
          <button onClick={onChooseStore} aria-label={t('Choose store')} className="flex h-9 w-[108px] min-w-0 items-center gap-1 rounded-full border border-[#b8d7c2] bg-[#e7f3e9] px-2 text-left sm:w-auto sm:max-w-[220px] sm:gap-2 sm:px-3">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#d3e9d8] text-[var(--brand-primary)] sm:h-6 sm:w-6"><MapPin size={12} strokeWidth={2.2} /></span>
            <span className="flex min-w-0 flex-1 items-center gap-0.5 text-[11px] font-semibold text-[var(--brand-primary)] sm:text-sm"><span className="min-w-0 flex-1 truncate">{selectedStore?.location ? capitalizeFirstLetter(selectedStore.location) : t('Choose store')}</span><ChevronDown size={12} className="shrink-0" /></span>
          </button>

          {/* Desktop nav */}
          <nav className="ml-2 hidden items-center gap-7 text-[13px] font-medium md:flex">
            {user && <NavLink to="/orders" className={({ isActive }) => isActive ? 'text-[var(--brand-primary)]' : 'text-[var(--text-secondary)] transition hover:text-[var(--text-secondary)]'}>{t('Orders')}</NavLink>}
            {user ? (
              <NavLink to="/profile" className="flex items-center gap-2 text-[var(--text-secondary)]"><UserRound size={16} strokeWidth={1.7} /> {user.name?.split(' ')[0] || t('Account')}</NavLink>
            ) : (
              <button onClick={onLogin} className="flex items-center gap-2 text-[var(--text-secondary)]"><UserRound size={16} strokeWidth={1.7} /> {t('Sign in')}</button>
            )}
          </nav>
          <button disabled={selectedStore?.isOpen === false} onClick={onOpenCart} aria-label={t('Open basket')} className="ml-0 hidden h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--border-default)] bg-white px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex sm:px-3.5 md:ml-0">
            <ShoppingBasket size={17} strokeWidth={1.7} />
            <span className="hidden sm:inline">{t('Basket')}</span>
            <span className="grid min-w-5 place-items-center rounded-full bg-[#f2e0dc] px-1 text-[10px] font-semibold text-[var(--brand-primary)]">{cartCount}</span>
          </button>
        </div>
      </div>
      {onCartError && <p role="status" className="mx-auto max-w-7xl px-5 pb-2 text-xs text-rose-700">{onCartError}</p>}
    </header>
  )
}
