import { useEffect, useState } from 'react'
import { ArrowRight, Package, RotateCw, Search, ShieldCheck, Truck } from 'lucide-react'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProductCard from '../components/ProductCard.jsx'
import CookingLoader from '../components/CookingLoader.jsx'
import CategoryPhoto from '../components/CategoryPhoto.jsx'
import { useProductCatalog } from '../hooks/useProductCatalog.js'
import { getErrorMessage } from '../utils.js'

/* ── hero carousel data ─────────────────────────── */
const heroSlides = [
  {
    eyebrow: 'Fresh meat. Fresh living.',
    title: 'Quality Meat\nfor ',
    titleAccent: 'Healthier Meals',
    description: 'Fresh cuts, daily. From our store to your home.',
    action: 'Shop Meat & Fish',
    category: 'meat',
    badge: 'Fresh\nDaily',
    bg: '/categories/meat-c.png',
  },
  {
    eyebrow: 'Straight from the market',
    title: 'Farm-Fresh\n',
    titleAccent: 'Vegetables',
    description: 'Crisp, vibrant greens from nearby farms.',
    action: 'Shop Vegetables',
    category: 'vegetable',
    badge: 'Just\nPicked',
    bg: '/categories/vege.png',
  },
  {
    eyebrow: 'Good food, close to home',
    title: 'Everyday\n',
    titleAccent: 'Pantry Staples',
    description: 'Rice, grains, oils — the essentials.',
    action: 'Shop Pantry',
    category: 'rice',
    badge: 'Best\nValue',
    bg: '/categories/Rustic-Pantry.png',
  },
]

/* ── category card subtitles ────────────────────── */
const categorySubtitles = {
  vegetable: 'Fresh & local',
  fruit: 'Seasonal & fresh',
  meat: 'Fresh cuts daily',
  rice: 'Food essentials',
  oil: 'Cook better',
  dairy: 'Protein for all',
  egg: 'Protein for all',
  bakery: 'Oven fresh',
}

function getCategorySubtitle(name) {
  const lower = (name || '').toLowerCase()
  for (const [key, value] of Object.entries(categorySubtitles)) {
    if (lower.includes(key)) return value
  }
  return 'Fresh picks'
}

/* ── category icon colors ───────────────────────── */
const categoryIconColors = [
  { bg: '#e9f3ec', fg: '#176149' },
  { bg: '#fce8e6', fg: '#b42332' },
  { bg: '#e3f1fa', fg: '#1a6cb0' },
  { bg: '#fef3e2', fg: '#a16207' },
  { bg: '#f3e8ff', fg: '#7c3aed' },
  { bg: '#ecfdf5', fg: '#059669' },
]

/* ── trust badges ───────────────────────────────── */
const trustBadges = [
  { icon: Truck, title: 'Fast Delivery', sub: 'Fresh to your door' },
  { icon: ShieldCheck, title: 'Quality Assured', sub: 'Hygienic & trusted' },
  { icon: Package, title: 'Wide Range', sub: 'Everything you need' },
]

export default function HomePage({ categoryScreen = false }) {
  const navigate = useNavigate()
  const { categoryId = '' } = useParams()
  const selectedStore = useSelector((state) => state.selectedStore)
  const {
    categories,
    browseCategories,
    categoryTints,
    categoriesLoading,
    categoriesError,
    refetchCategories,
    search,
    setSearch,
    products,
    error,
    isLoading,
    isFetching,
    refetch,
    usingCatalogFallback,
    data,
    page,
    setPageState,
    category,
  } = useProductCatalog({ categoryScreen, categoryId })

  const [heroSlideIndex, setHeroSlideIndex] = useState(0)
  const [heroInteractionPaused, setHeroInteractionPaused] = useState(false)
  const activeHeroSlide = heroSlides[heroSlideIndex]
  const homeCategories = browseCategories.slice(0, 6)

  useEffect(() => {
    if (heroInteractionPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const interval = window.setInterval(() => {
      setHeroSlideIndex((current) => (current + 1) % heroSlides.length)
    }, 6000)
    return () => window.clearInterval(interval)
  }, [heroInteractionPaused])

  return (
    <div className="customer-home mx-auto max-w-7xl pb-5 pt-0 sm:px-6 sm:pt-4 lg:px-8">
      {/* ── Search bar ──────────────────────────────── */}
      {/* <div className="px-4 pb-2 pt-3 sm:px-0">
        <label className="customer-search mx-auto flex h-12 max-w-3xl items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[#f5f5f3] px-4 text-[var(--text-secondary)] focus-within:border-[var(--brand-primary)] focus-within:bg-white sm:h-14 sm:rounded-[18px]">
          <Search size={19} strokeWidth={1.9} className="text-[#999]" />
          <input aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for meat, vegetables, rice, eggs..." className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[#999] sm:text-[15px]" />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="shrink-0 text-xs font-semibold text-[var(--brand-primary)]">Clear</button>}
        </label>
      </div> */}

      {/* ── Sticky Search Bar ───────────────────────── */}
      <div className="sticky top-0 z-40 border-b border-[#e7e9e2] bg-[#fffefa]/95 px-3 py-2 backdrop-blur-md sm:px-0 sm:py-3">
        <label className="customer-search mx-auto flex h-12 max-w-3xl items-center gap-3 rounded-2xl border border-[#dfe5d8] bg-[#f5f6f0] px-4 text-[#687568] transition focus-within:border-[#39734b] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#39734b]/10 sm:h-14 sm:rounded-[18px]">
          <Search size={20} strokeWidth={1.9} className="shrink-0 text-[#39734b]" />
          <input
            aria-label="Search products"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search meat, vegetables, rice, eggs..."
            className="w-full bg-transparent text-sm text-[#203328] outline-none placeholder:text-[#8b9488] sm:text-[15px]"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
              className="shrink-0 rounded-full px-2 py-1 text-xs font-bold text-[#39734b] hover:bg-[#e9f3ec]"
            >
              Clear
            </button>
          )}
        </label>
      </div>


      {!categoryScreen && (
        <>
          {/* ── Hero banner ───────────────────────────── */}
          <section
            aria-label="Store highlights"
            aria-roledescription="carousel"
            className="customer-hero relative mx-3 mt-2 overflow-hidden rounded-[20px] sm:mx-0 sm:mt-4 sm:rounded-[24px]"
            onMouseEnter={() => setHeroInteractionPaused(true)}
            onMouseLeave={() => setHeroInteractionPaused(false)}
            onFocusCapture={() => setHeroInteractionPaused(true)}
            onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHeroInteractionPaused(false) }}
          >
            {/* Background image */}
            <div className="absolute inset-0 z-0">
              <img key={activeHeroSlide.bg} src={activeHeroSlide.bg} alt="" className="h-full w-full object-cover transition-opacity duration-500" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a1a]/85 via-[#1a1a1a]/60 to-transparent" />
            </div>

            <div key={heroSlideIndex} role="group" aria-roledescription="slide" aria-label={`${heroSlideIndex + 1} of ${heroSlides.length}`} className="customer-hero-slide relative z-10 flex min-h-[200px] items-center px-5 py-6 sm:min-h-[280px] sm:px-10 sm:py-10">
              <div className="max-w-[65%] sm:max-w-[55%]">
                <span className="text-[8px] font-bold uppercase tracking-[.18em] text-white/80 sm:text-[10px]">{activeHeroSlide.eyebrow}</span>
                <h1 className="mt-2 text-[1.4rem] font-bold leading-[1.1] tracking-[-.03em] text-white sm:mt-3 sm:text-[2.4rem]">
                  {activeHeroSlide.title}<span className="text-[#8cc61f]">{activeHeroSlide.titleAccent}</span>
                </h1>
                <p className="mt-2 text-[10px] leading-relaxed text-white/70 sm:mt-3 sm:text-sm">{activeHeroSlide.description}</p>
                <button
                  type="button"
                  onClick={() => navigate(activeHeroSlide.category ? `/categories/${encodeURIComponent(activeHeroSlide.category)}` : '/categories')}
                  className="mt-3 inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 text-[11px] font-bold text-[#1d3028] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#e9f4e9] sm:mt-5 sm:h-11 sm:gap-2 sm:px-5 sm:text-xs"
                >
                  {activeHeroSlide.action} <ArrowRight size={13} className="shrink-0" />
                </button>
              </div>

              {/* Fresh Daily badge */}
              <div className="absolute right-4 top-4 grid h-14 w-14 place-items-center rounded-full bg-[#8cc61f] text-center sm:right-8 sm:top-6 sm:h-16 sm:w-16">
                <span className="text-[9px] font-bold leading-tight text-white sm:text-[10px]" style={{ whiteSpace: 'pre-line' }}>{activeHeroSlide.badge}</span>
              </div>
            </div>

            {/* Pagination dots */}
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 sm:bottom-5" aria-label="Choose highlight">
              {heroSlides.map((slide, index) => (
                <button key={slide.category} type="button" aria-label={`Show ${slide.action}`} aria-current={index === heroSlideIndex} onClick={() => setHeroSlideIndex(index)} className={`h-2 rounded-full transition-all ${index === heroSlideIndex ? 'w-5 bg-white' : 'w-2 bg-white/45 hover:bg-white/75'}`} />
              ))}
            </div>
          </section>

          {/* ── Trust badges row ──────────────────────── */}
          {/* <div className="no-scrollbar mt-4 flex gap-0 overflow-x-auto px-4 sm:mt-5 sm:gap-3 sm:px-0">
            {trustBadges.map((badge) => (
              <div key={badge.title} className="flex flex-1 shrink-0 items-center gap-2 rounded-xl px-2 py-2.5 sm:gap-3 sm:rounded-2xl sm:border sm:border-[var(--border-default)] sm:bg-white sm:px-4 sm:py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e9f3ec] text-[var(--brand-primary)] sm:h-10 sm:w-10">
                  <badge.icon size={15} strokeWidth={1.8} className="sm:h-[18px] sm:w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold text-[var(--text-primary)] sm:text-xs">{badge.title}</span>
                  <span className="block text-[8px] text-[var(--text-secondary)] sm:text-[10px]">{badge.sub}</span>
                </span>
              </div>
            ))}
          </div> */}

        {/* ── Trust badges row ─────────────────────── */}
        <div className="trust-benefits-enter mt-4 grid grid-cols-3 gap-2 px-3 sm:mt-5 sm:gap-3 sm:px-0">
          {trustBadges.map((badge) => (
            <div
              key={badge.title}
              className="trust-benefit-card flex min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-[#dce8d8] bg-[#f2f7ee] px-2 py-3 text-center sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:py-4 sm:text-left"
            >
              <span className="trust-benefit-icon grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#286640] shadow-sm sm:h-11 sm:w-11">
                <badge.icon size={19} strokeWidth={1.9} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-extrabold leading-tight text-[#203328] sm:text-xs">
                  {badge.title}
                </span>
                <span className="mt-1 block text-[9px] leading-tight text-[#627264] sm:text-[11px]">
                  {badge.sub}
                </span>
              </span>
            </div>
          ))}
        </div>


          {/* ── Divider ───────────────────────────────── */}
          <hr className="mx-4 mt-3 border-[var(--border-default)] sm:mx-0 sm:mt-5" />

          {/* ── Shop by category ──────────────────────── */}
          <section id="browse-categories" className="scroll-mt-28 px-4 pt-5 sm:scroll-mt-32 sm:px-0 sm:pt-8">
            <div className="mb-4 sm:mb-5">
              <p className="text-[9px] font-bold uppercase tracking-[.18em] text-[var(--text-secondary)] sm:text-[10px]">A market in a few taps</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <h2 className="text-[1.35rem] font-extrabold tracking-[-.045em] text-[var(--text-primary)] sm:text-3xl">Shop by category</h2>
                <Link to="/categories" className="mb-0.5 inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[var(--brand-primary)] sm:text-sm">See all <ArrowRight size={14} /></Link>
              </div>
            </div>

            {categoriesError && <p role="alert" className="mb-3 rounded-xl bg-[var(--status-danger-soft)] px-3 py-2 text-xs text-[var(--status-danger)]">We couldn't load categories from the store. <button type="button" onClick={refetchCategories} className="font-bold underline">Try again</button></p>}
            {categoriesLoading && <p role="status" className="mb-3 text-xs text-[var(--text-secondary)]">Loading store categories…</p>}

            {!categoriesLoading && !categoriesError && homeCategories.length > 0 && (
              <div className="category-grid-enter grid grid-cols-3 gap-2.5 sm:gap-4 lg:gap-5">
                {homeCategories.map((item, index) => {
                  const iconColor = categoryIconColors[index % categoryIconColors.length]
                  return (
                    <Link key={item.id} to={`/categories/${encodeURIComponent(item.id)}`} className="category-tile group min-w-0 overflow-hidden rounded-[14px] border border-[var(--border-default)] bg-white text-left shadow-[0_3px_12px_-8px_rgba(17,44,31,.18)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-secondary)] hover:shadow-[0_8px_20px_-12px_rgba(17,44,31,.3)] sm:rounded-[20px]">
                      <span className="block aspect-[1.15] overflow-hidden sm:aspect-[1.3]" style={{ backgroundColor: categoryTints[index % categoryTints.length] }}>
                        <CategoryPhoto category={item.label} imageUrl={item.imageUrl} placeholderOnly className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
                      </span>
                      <span className="flex items-center gap-1.5 px-2 py-2 sm:gap-2.5 sm:px-3 sm:py-2.5">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full sm:h-8 sm:w-8" style={{ backgroundColor: iconColor.bg, color: iconColor.fg }}>
                          <ArrowRight size={11} className="sm:h-[14px] sm:w-[14px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] font-bold leading-tight text-[var(--text-primary)] sm:text-[13px]">{item.label}</span>
                          <span className="mt-0 block truncate text-[8px] leading-3 text-[var(--text-secondary)] sm:mt-0.5 sm:text-[10px] sm:leading-3">{getCategorySubtitle(item.id)}</span>
                        </span>
                        <ArrowRight size={12} className="shrink-0 text-[var(--text-secondary)] opacity-0 transition group-hover:opacity-60 sm:h-[14px] sm:w-[14px]" />
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Fresh picks / Products ────────────────── */}
      <section id="products" className={`scroll-mt-20 px-4 sm:px-0 ${categoryScreen ? 'pt-2 sm:pt-5' : 'pt-6 sm:scroll-mt-24 sm:pt-10'}`}>
        {/* <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-4">
          <div>
            {categoryScreen ? (
              <Link to="/categories" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand-primary)]"><ArrowRight className="rotate-180" size={15} /> All categories</Link>
            ) : (
              <p className="text-[9px] font-bold uppercase tracking-[.15em] text-[var(--text-secondary)] sm:text-[10px] sm:tracking-[.19em]">From your neighbourhood store</p>
            )}
            <div className="mt-1 flex items-end justify-between gap-3">
              <h2 className="text-xl font-bold tracking-[-.035em] text-[var(--text-primary)] sm:text-[2rem]">{categoryScreen ? formatCategoryLabel(category) : 'Fresh picks for you'}</h2>
              {!categoryScreen && <Link to="/categories" className="mb-0.5 inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[var(--brand-primary)] sm:text-sm">See all <ArrowRight size={14} /></Link>}
            </div>
          </div>
        </div> */}
{/*
        <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            {categoryScreen ? (
              <Link
                to="/categories"
                className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand-primary)]"
              >
                <ArrowRight className="rotate-180" size={15} />
                All categories
              </Link>
            ) : (
              <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--text-secondary)]">
                From your neighbourhood store
              </p>
            )}

            <h2 className="mt-2 text-[1.6rem] font-extrabold leading-tight tracking-[-.045em] text-[var(--text-primary)] sm:text-3xl">
              {categoryScreen ? formatCategoryLabel(category) : 'Fresh picks for you'}
            </h2>
          </div>

          {!categoryScreen && (
            <Link
              to="/categories"
              className="mb-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-2 text-xs font-bold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)] sm:text-sm"
            >
              See all <ArrowRight size={14} />
            </Link>
          )}
        </div> */}


        <div className="mt-6 grid gap-4 sm:mt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-4">
          {!categoryScreen && (
            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--text-secondary)]">Browse departments</p>
                {/* <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--text-secondary)]">Shop by category</p> */}
                <span className="text-[10px] text-[var(--text-secondary)] sm:hidden">Swipe to explore</span>
              </div>
              <div aria-label="Product categories" className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto pb-1 sm:gap-1.5">
                {categories.map((item) => (
                  <Link key={item.id} to={item.id ? `/categories/${encodeURIComponent(item.id)}` : '/'} className="shrink-0 rounded-full border border-[var(--border-default)] bg-white px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] shadow-sm transition hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)] sm:px-4 sm:py-2.5 sm:text-xs">{item.label}</Link>
                ))}
              </div>
            </div>
          )}
          {/* <label className="flex h-11 min-w-0 items-center gap-3 rounded-xl border border-[var(--border-default)] bg-white px-3.5 text-[var(--text-secondary)] sm:h-10 sm:min-w-[190px]">
            <ArrowDownWideNarrow size={16} strokeWidth={1.8} />
            <span className="shrink-0 text-xs font-semibold text-[var(--text-secondary)]">Sort by</span>
            <select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)}
className="shrink-0 rounded-full border border-[#d6e3d3] bg-[#f0f6ed] px-4 py-2.5 text-xs font-bold text-[#315c3d] shadow-sm transition hover:border-[#39734b] hover:bg-[#dfeedd] hover:text-[#203328] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39734b] sm:px-4 sm:py-2.5 sm:text-xs"
>
              <option value="recommended">Recommended</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="name">Name: A–Z</option>
            </select>
          </label> */}
          {/* <label className="flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-[var(--border-default)] bg-white px-3.5 text-[var(--text-secondary)] sm:h-10 sm:w-fit sm:justify-self-end">
  <ArrowDownWideNarrow size={16} strokeWidth={1.8} className="shrink-0" />
  <span className="shrink-0 text-xs font-semibold text-[var(--text-secondary)]">Sort by</span>
  <select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)} className="min-w-0 flex-1 cursor-pointer bg-transparent text-right text-xs font-semibold text-[var(--text-secondary)] outline-none sm:flex-none sm:text-left">
    <option value="recommended">Recommended</option>
    <option value="price-low">Price: low to high</option>
    <option value="price-high">Price: high to low</option>
    <option value="name">Name: A–Z</option>
  </select>
</label> */}
        </div>

        <div className="mt-4 flex min-h-5 items-center justify-between gap-2 border-b border-[var(--border-default)] pb-3 sm:mt-5">
          <p className="text-[10px] text-[var(--text-secondary)] sm:text-[11px]">{selectedStore ? `${selectedStore.storeName}${data?.pagination ? ` · ${usingCatalogFallback ? products.length : data.pagination.total} items` : ''}` : 'Choose a store to see its selection'}</p>
          {isFetching && !isLoading && <span className="text-[11px] text-[var(--text-secondary)]">Updating selection…</span>}
        </div>
        {(isLoading || (isFetching && !data)) && <div className="mt-4 rounded-2xl border border-[var(--border-default)] bg-white"><CookingLoader compact label="Finding fresh picks for you…" /></div>}
        {error && <div role="alert" className="mt-5 rounded-2xl border border-[#e8d9d2] bg-[#fbf5f2] p-5 text-sm text-[var(--text-secondary)]"><p className="font-semibold">We couldn't load the selection.</p><p className="mt-1 text-xs">{getErrorMessage(error)}</p><button onClick={refetch} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline"><RotateCw size={13} /> Try again</button></div>}
        {usingCatalogFallback && <p role="status" className="mt-3 text-[10px] text-[var(--text-secondary)]">Showing products matched to this store.</p>}
        {!selectedStore && !error && <div className="mt-5 rounded-2xl bg-white px-5 py-12 text-center text-sm text-[var(--text-secondary)]">Choose a store to browse its available products.</div>}
        {!isLoading && !isFetching && !error && selectedStore && products.length > 0 && <div className="product-grid mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">{products.map((product) => <ProductCard key={product._id} product={product} />)}</div>}
        {!isLoading && !isFetching && !error && selectedStore && products.length === 0 && <div className="mt-5 rounded-2xl bg-white px-6 py-14 text-center"><h3 className="font-display text-xl text-[var(--text-secondary)]">Nothing here just yet</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">Try another category or search term.</p></div>}
        {data?.pagination?.pages > 1 && (
          <div className="mt-7 flex items-center justify-center gap-3">
            <button disabled={page <= 1 || isFetching} onClick={() => setPageState({ storeId: selectedStore._id, category, search, page: page - 1 })} className="rounded-full border border-[var(--border-default)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-white disabled:opacity-40">Previous</button>
            <span className="text-[11px] text-[var(--text-secondary)]">Page {page} of {data.pagination.pages}</span>
            <button disabled={page >= data.pagination.pages || isFetching} onClick={() => setPageState({ storeId: selectedStore._id, category, search, page: page + 1 })} className="rounded-full border border-[var(--border-default)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-white disabled:opacity-40">Next</button>
          </div>
        )}
      </section>
    </div>
  )
}
