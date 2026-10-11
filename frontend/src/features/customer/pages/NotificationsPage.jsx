import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  useGetUserNotificationsQuery,
  useMarkAllUserNotificationsReadMutation,
  useMarkUserNotificationReadMutation,
} from '../../api/api.js'
import { getErrorMessage } from '../utils.js'

export default function NotificationsPage() {
  const [page, setPage] = useState(1)
  const { data: response, isLoading, error } = useGetUserNotificationsQuery({ page, limit: 20 }, { pollingInterval: 30000 })
  const [markRead] = useMarkUserNotificationReadMutation()
  const [markAllRead, markAllState] = useMarkAllUserNotificationsReadMutation()
  const notifications = response?.data || []
  const pagination = response?.pagination
  const [actionError, setActionError] = useState('')

  async function openNotification(notification) {
    if (notification.readAt) return
    setActionError('')
    try {
      await markRead(notification._id).unwrap()
    } catch (requestError) {
      setActionError(getErrorMessage(requestError))
    }
  }

  async function markEverythingRead() {
    setActionError('')
    try {
      await markAllRead().unwrap()
    } catch (requestError) {
      setActionError(getErrorMessage(requestError))
    }
  }

  return <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#ad7669]">Your updates</p><h1 className="mt-1 font-display text-3xl font-medium text-[#392824]">Notifications</h1><p className="mt-2 text-sm text-[#82736d]">{response?.unreadCount || 0} unread updates</p></div>
      {(response?.unreadCount || 0) > 0 && <button type="button" disabled={markAllState.isLoading} onClick={markEverythingRead} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#eadfd7] bg-white px-3 text-xs font-semibold text-[#76534a] transition hover:bg-[#fff8f4] disabled:opacity-50"><CheckCheck size={15} />Mark all read</button>}
    </div>
    {(error || actionError) && <p role="alert" className="mt-5 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{actionError || `Couldn’t load notifications: ${getErrorMessage(error)}`}</p>}
    {isLoading ? <p className="mt-6 rounded-2xl bg-white p-6 text-sm text-[#82736d]">Loading notifications…</p> : notifications.length ? <div className="mt-6 space-y-3">
      {notifications.map((notification) => <article key={notification._id} className={`rounded-2xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-24px_rgba(91,43,33,.5)] ${notification.readAt ? 'border-[#eadfd7] bg-white' : 'border-[#e7c8bd] bg-[#fffaf6]'}`}>
        <div className="flex gap-3">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${notification.readAt ? 'bg-[#f5eee8] text-[#87634f]' : 'bg-[#fbefec] text-[#9b5148]'}`}><Bell size={17} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-sm font-semibold text-[#493631]">{notification.title}</h2>{!notification.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#861923]" aria-label="Unread" />}</div>
            <p className="mt-1 text-sm leading-6 text-[#765f55]">{notification.message}</p>
            <p className="mt-2 text-[11px] text-[#9a8b83]">{new Date(notification.createdAt).toLocaleString('en-IN')}</p>
            <Link to={`/orders?order=${notification.orderId}`} onClick={() => openNotification(notification)} className="mt-3 inline-flex text-xs font-semibold text-[#861923] hover:underline">View order →</Link>
          </div>
        </div>
      </article>)}
    </div> : !error && <div className="mt-6 rounded-2xl border border-[#eadfd7] bg-white px-5 py-12 text-center"><Bell className="mx-auto text-[#c0988e]" size={26} /><h2 className="mt-3 text-sm font-semibold text-[#493631]">You’re all caught up</h2><p className="mt-1 text-xs text-[#8b7d76]">Order updates will appear here.</p></div>}
    {pagination?.pages > 1 && <div className="mt-5 flex items-center justify-between gap-3 text-xs text-[#82736d]"><span>Page {page} of {pagination.pages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#eadfd7] bg-white px-3 font-semibold disabled:opacity-45"><ChevronLeft size={14} />Previous</button><button type="button" disabled={page >= pagination.pages} onClick={() => setPage((current) => current + 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#eadfd7] bg-white px-3 font-semibold disabled:opacity-45">Next<ChevronRight size={14} /></button></div></div>}
  </section>
}
