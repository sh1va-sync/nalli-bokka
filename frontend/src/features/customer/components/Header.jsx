import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ChevronDown, ShoppingBasket, UserRound } from 'lucide-react'
import {
  useGetUserNotificationsQuery,
  useMarkAllUserNotificationsReadMutation,
  useMarkUserNotificationReadMutation,
} from '../../api/api.js'
import { getErrorMessage } from '../utils.js'

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
    <header className="sticky top-0 z-30 border-b border-[#eadfd7] bg-[#fbf7f1]/95 backdrop-blur-md">
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-2 px-4 py-2.5 sm:flex sm:gap-4 sm:px-6 sm:py-3.5 lg:px-8">
        <Link to="/" className="col-start-1 row-start-1 flex min-w-0 shrink-0 items-center gap-2 sm:col-auto sm:row-auto sm:gap-2.5" aria-label="NalliBokka home">
          <img src="/nallibokka-logo.png" alt="" className="h-10 w-10 object-contain" />
          <span className="leading-tight">
            <span className="block font-display text-[17px] font-semibold tracking-[-.045em] text-[#392824]">NalliBokka</span>
            <span className="mt-0.5 hidden text-[9px] font-medium uppercase tracking-[.2em] text-[#9a8176] sm:block">Everyday, thoughtfully fresh</span>
          </span>
        </Link>
        <span className="mx-1 hidden h-8 w-px bg-[#e7e3d9] sm:block" />
        <button onClick={onChooseStore} className="col-span-3 row-start-2 flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[#eee5dc] bg-white/70 px-3 py-2 text-left sm:col-span-1 sm:row-auto sm:flex-col sm:items-start sm:justify-start sm:gap-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <span className="min-w-0">
            <span className="block text-[9px] font-semibold uppercase tracking-[.16em] text-[#929385]">Delivering to</span>
            <span className="mt-0.5 flex items-center gap-1 truncate text-xs font-semibold text-[#46332e] sm:text-sm">{selectedStore?.location || 'Choose your store'} <ChevronDown size={13} className="shrink-0 text-[#94776d]" /></span>
          </span>
          {selectedStore && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold ${selectedStore.isOpen === false ? 'bg-[#f7eae8] text-[#8b4f49]' : 'bg-[#edf5ee] text-[#4a7758]'}`}>{selectedStore.isOpen === false ? 'Currently closed' : 'Open for orders'}</span>}
        </button>
        <nav className="ml-auto hidden items-center gap-7 text-[13px] font-medium md:flex">
          {user && <NavLink to="/orders" className={({ isActive }) => isActive ? 'text-[#861923]' : 'text-[#82736d] transition hover:text-[#46332e]'}>Orders</NavLink>}
          {user ? (
            <NavLink to="/profile" className="flex items-center gap-2 text-[#51413b]"><UserRound size={16} strokeWidth={1.7} /> {user.name?.split(' ')[0] || 'Account'}</NavLink>
          ) : (
            <button onClick={onLogin} className="flex items-center gap-2 text-[#51413b]"><UserRound size={16} strokeWidth={1.7} /> Sign in</button>
          )}
        </nav>
        {user && <div ref={notificationMenuRef} className="relative col-start-2 row-start-1 md:ml-6">
          <button type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={notificationsOpen} aria-haspopup="dialog" onClick={() => { setNotificationActionError(''); setOpenNotificationsForUser((openUserId) => openUserId === user._id ? null : user._id) }} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e7d7ce] text-[#76534a] transition hover:bg-[#f8eeea]">
            <Bell size={18} />
            {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#861923] px-1 text-[9px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          {notificationsOpen && <section role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-[4.5rem] z-50 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-2xl border border-[#eadfd7] bg-[#fffdfa] shadow-[0_18px_48px_-20px_rgba(48,36,31,.35)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:max-h-[min(70vh,32rem)] sm:w-[min(22rem,calc(100vw-1.5rem))]">
            <div className="flex items-center justify-between border-b border-[#f1e9e4] px-4 py-3">
              <div><h2 className="text-sm font-semibold text-[#493631]">Notifications</h2><p className="mt-0.5 text-[10px] text-[#8b7d76]">{unreadCount} unread</p></div>
              {unreadCount > 0 && <button type="button" disabled={markAllNotificationsState.isLoading} onClick={markAllRead} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#861923] disabled:opacity-50"><CheckCheck size={13} />Mark all read</button>}
            </div>
            {notificationActionError && <p role="alert" className="mx-3 mt-3 rounded-lg bg-[#fbefec] p-2.5 text-xs text-[#8c4034]">{notificationActionError}</p>}
            {notificationsError
              ? <p role="alert" className="p-4 text-xs text-[#8c4034]">Couldn’t load notifications: {getErrorMessage(notificationsError)}</p>
              : notificationsLoading
                ? <p role="status" className="p-5 text-center text-xs text-[#82736d]">Loading notifications…</p>
                : notifications.length
                  ? <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto sm:max-h-[min(65vh,26rem)]">
                    {notifications.map((notification) => <button key={notification._id} type="button" onClick={() => openOrderNotification(notification)} className={`block w-full border-b border-[#f1e9e4] px-4 py-3 text-left transition hover:bg-[#fff8f4] last:border-0 ${notification.readAt ? '' : 'bg-[#fffaf6]'}`}>
                      <span className="flex items-start justify-between gap-3"><span className="text-xs font-semibold text-[#493631]">{notification.title}</span>{!notification.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#861923]" aria-label="Unread" />}</span>
                      <span className="mt-1 block text-[11px] leading-4 text-[#765f55]">{notification.message}</span>
                      <span className="mt-1.5 block text-[10px] text-[#9a8b83]">{new Date(notification.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · View order</span>
                    </button>)}
                  </div>
                  : <p className="px-4 py-8 text-center text-xs text-[#82736d]">You’re all caught up. Order updates will appear here.</p>}
          </section>}
        </div>}
        <button disabled={selectedStore?.isOpen === false} onClick={onOpenCart} aria-label="Open basket" className="col-start-3 row-start-1 ml-0 flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#e7d7ce] bg-transparent px-3 text-xs font-semibold text-[#493631] transition hover:border-[#c98c7f] hover:bg-[#f8eeea] disabled:cursor-not-allowed disabled:opacity-40 sm:px-3.5 md:ml-0">
          <ShoppingBasket size={17} strokeWidth={1.7} />
          <span className="hidden sm:inline">Basket</span>
          <span className="grid min-w-5 place-items-center rounded-full bg-[#f2e0dc] px-1 text-[10px] font-semibold text-[#861923]">{cartCount}</span>
        </button>
      </div>
      {onCartError && <p role="status" className="mx-auto max-w-7xl px-5 pb-2 text-xs text-rose-700">{onCartError}</p>}
    </header>
  )
}
