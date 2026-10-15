import { ArrowRight, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

const stageMessages = {
  placed: 'Your order is placed and being confirmed.',
  packing: 'Your store is packing your fresh order.',
  'out for delivery': 'Your order is on its way to you.',
  'ready for pickup': 'Your order is ready to collect from the store.',
}

export default function ActiveOrderBanner({ order }) {
  const orderStages = order.orderType === 'pickup'
    ? ['placed', 'packing', 'ready for pickup']
    : ['placed', 'packing', 'out for delivery']
  const stageIndex = orderStages.indexOf(order.orderStatus)
  const progress = `${((stageIndex + 1) / orderStages.length) * 100}%`

  return <section className="active-order-banner mx-auto max-w-7xl px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8" aria-label="Active order">
    <Link
      to={`/orders?order=${order._id}`}
      className="group relative block overflow-hidden rounded-2xl border border-[var(--brand-secondary)] bg-gradient-to-r from-white via-[var(--brand-primary-soft)] to-[#e6f3e4] p-4 shadow-[0_8px_24px_-18px_rgba(22,101,52,.55)] transition hover:shadow-[0_12px_30px_-16px_rgba(22,101,52,.45)] sm:p-5"
      aria-label={`Track order ${order._id.slice(-8).toUpperCase()}, ${order.orderStatus}`}
    >
      <span className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-white/50 transition-transform duration-700 group-hover:scale-125" aria-hidden="true" />
      <div className="relative flex items-center gap-3 sm:gap-4">
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-primary)] text-white shadow-sm sm:h-12 sm:w-12">
          <PackageCheck size={23} strokeWidth={1.8} />
          <span className="active-order-pulse absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-[#8abf79]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--brand-primary)]">{order.orderType === 'pickup' ? 'Pickup order' : 'Order in progress'}</span>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold capitalize text-[var(--text-secondary)]">{order.orderStatus}</span>
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-[var(--text-primary)] sm:text-base">{stageMessages[order.orderStatus]}</span>
          <span className="mt-0.5 block text-[10px] text-[var(--text-secondary)]">Order #{order._id.slice(-8).toUpperCase()} · Tap to track</span>
        </span>
        <ArrowRight size={18} className="relative shrink-0 text-[var(--brand-primary)] transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
      </div>
      <span className="relative mt-4 block h-1 overflow-hidden rounded-full bg-white/80" aria-hidden="true">
        <span className="active-order-progress block h-full rounded-full bg-[var(--brand-primary)]" style={{ '--order-progress': progress }} />
      </span>
    </Link>
  </section>
}
