import { useSelector } from 'react-redux'
import { Link, NavLink } from 'react-router-dom'
import { ChevronDown, ShoppingBasket, UserRound } from 'lucide-react'

export default function Header({ cartCount, onOpenCart, onChooseStore, onLogin, onCartError }) {
  const selectedStore = useSelector((state) => state.selectedStore)
  const user = useSelector((state) => state.auth.user)

  return (
    <header className="sticky top-0 z-30 border-b border-[#eadfd7] bg-[#fbf7f1]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="NalliBokka home">
          <img src="/nallibokka-logo.png" alt="" className="h-10 w-10 object-contain" />
          <span className="leading-tight">
            <span className="block font-display text-[17px] font-semibold tracking-[-.045em] text-[#392824]">NalliBokka</span>
            <span className="mt-0.5 hidden text-[9px] font-medium uppercase tracking-[.2em] text-[#9a8176] sm:block">Everyday, thoughtfully fresh</span>
          </span>
        </Link>
        <span className="mx-1 hidden h-8 w-px bg-[#e7e3d9] sm:block" />
        <button onClick={onChooseStore} className="flex min-w-0 flex-col text-left">
          <span className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#929385]">Delivering to</span>
          <span className="mt-0.5 flex items-center gap-1 truncate text-xs font-semibold text-[#46332e] sm:text-sm">{selectedStore?.location || 'Choose your store'} <ChevronDown size={13} className="shrink-0 text-[#94776d]" /></span>
        </button>
        <nav className="ml-auto hidden items-center gap-7 text-[13px] font-medium md:flex">
          {user && <NavLink to="/orders" className={({ isActive }) => isActive ? 'text-[#861923]' : 'text-[#82736d] transition hover:text-[#46332e]'}>Orders</NavLink>}
          {user ? (
            <NavLink to="/profile" className="flex items-center gap-2 text-[#51413b]"><UserRound size={16} strokeWidth={1.7} /> {user.name?.split(' ')[0] || 'Account'}</NavLink>
          ) : (
            <button onClick={onLogin} className="flex items-center gap-2 text-[#51413b]"><UserRound size={16} strokeWidth={1.7} /> Sign in</button>
          )}
        </nav>
        <button onClick={onOpenCart} aria-label="Open basket" className="ml-auto flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#e7d7ce] bg-transparent px-3.5 text-xs font-semibold text-[#493631] transition hover:border-[#c98c7f] hover:bg-[#f8eeea] md:ml-0">
          <ShoppingBasket size={17} strokeWidth={1.7} />
          <span className="hidden sm:inline">Basket</span>
          <span className="grid min-w-5 place-items-center rounded-full bg-[#f2e0dc] px-1 text-[10px] font-semibold text-[#861923]">{cartCount}</span>
        </button>
      </div>
      {onCartError && <p role="status" className="mx-auto max-w-7xl px-5 pb-2 text-xs text-rose-700">{onCartError}</p>}
    </header>
  )
}
