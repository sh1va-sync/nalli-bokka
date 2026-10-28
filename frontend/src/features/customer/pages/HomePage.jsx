import { useEffect, useState } from 'react'
import { ArrowDownWideNarrow, ArrowRight, Apple, Leaf, RotateCw, Search, Wheat } from 'lucide-react'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProductCard from '../components/ProductCard.jsx'
import CookingLoader from '../components/CookingLoader.jsx'
import CategoryPhoto from '../components/CategoryPhoto.jsx'
import { formatCategoryLabel, useProductCatalog } from '../hooks/useProductCatalog.js'
import { getErrorMessage } from '../utils.js'

const heroSlides = [
  {
    eyebrow: 'Picked fresh today',
    title: 'Fresh picks',
    image: '/hero/fresh-picks.svg',
    imageAlt: 'Illustration of fresh apples and citrus in a market bowl',
    icon: Apple,
    action: 'Shop fresh picks',
    category: '',
    description: 'Handpicked for the way you cook.',
    theme: 'from-[#103f32] via-[#155642] to-[#216a4d]',
    accent: 'text-[#d1f5a8]',
  },
  {
    eyebrow: 'Straight from the market',
    title: 'Market greens',
    image: '/hero/green-market.svg',
    imageAlt: 'Illustration of leafy greens and vegetables in a market basket',
    icon: Leaf,
    action: 'Shop vegetables',
    category: 'vegetable',
    description: 'Crisp, vibrant greens from nearby.',
    theme: 'from-[#123f33] via-[#175b46] to-[#2f7952]',
    accent: 'text-[#d1f5a8]',
  },
  {
    eyebrow: 'Good food, close to home',
    title: 'Pantry favourites',
    image: '/hero/pantry-favourites.svg',
    imageAlt: 'Illustration of rice and pantry staples',
    icon: Wheat,
    action: 'Shop pantry picks',
    category: 'rice',
    description: 'Everyday staples, chosen with care.',
    theme: 'from-[#293e2d] via-[#385b3d] to-[#64814b]',
    accent: 'text-[#e1f4b2]',
  },
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
    sort,
    setSort,
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
  const HeroIcon = activeHeroSlide.icon
  const homeCategories = browseCategories.slice(0, 3)

  useEffect(() => {
    if (heroInteractionPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const interval = window.setInterval(() => {
      setHeroSlideIndex((current) => (current + 1) % heroSlides.length)
    }, 6000)
    return () => window.clearInterval(interval)
  }, [heroInteractionPaused])

  return (
    <div className="customer-home mx-auto max-w-7xl px-4 pb-5 pt-4 sm:px-6 sm:pt-8 lg:px-8">
      <div className="sticky top-[60px] z-20 -mx-4 bg-[var(--bg-app)]/95 px-4 py-2 backdrop-blur-md sm:top-[68px] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <label className="customer-search mx-auto flex h-12 max-w-3xl items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-white px-4 text-[var(--text-secondary)] shadow-[0_3px_14px_-10px_rgba(18,49,37,.35)] focus-within:border-[var(--brand-primary)] sm:h-14 sm:rounded-[18px]">
          <Search size={19} strokeWidth={1.9} />
          <input aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search fresh products or brands" className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] sm:text-[15px]" />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="shrink-0 text-xs font-semibold text-[var(--brand-primary)]">Clear</button>}
        </label>
      </div>

      {!categoryScreen && (
        <section aria-label="Store highlights" aria-roledescription="carousel" className={`customer-hero relative mt-5 min-h-[218px] overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br px-5 py-5 shadow-[0_18px_42px_-24px_rgba(10,45,31,.6)] transition-colors duration-700 sm:mt-7 sm:min-h-[310px] sm:rounded-[30px] sm:px-10 sm:py-9 ${activeHeroSlide.theme}`} onMouseEnter={() => setHeroInteractionPaused(true)} onMouseLeave={() => setHeroInteractionPaused(false)} onFocusCapture={() => setHeroInteractionPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHeroInteractionPaused(false) }}>
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-white/15 sm:right-16 sm:h-72 sm:w-72" />
          <div className="pointer-events-none absolute -right-5 -top-12 h-40 w-40 rounded-full border border-white/15 sm:right-24 sm:h-56 sm:w-56" />
          <img key={activeHeroSlide.image} src={activeHeroSlide.image} alt={activeHeroSlide.imageAlt} className="pointer-events-none absolute -right-3 top-1/2 h-[88%] w-[59%] -translate-y-1/2 object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,.24)] transition-transform duration-500 sm:right-7 sm:h-[94%] sm:w-[48%]" />
          <div key={heroSlideIndex} role="group" aria-roledescription="slide" aria-label={`${heroSlideIndex + 1} of ${heroSlides.length}`} className="relative z-10 max-w-[62%] pb-4 text-white sm:max-w-[52%]">
            <span className={`inline-flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[.14em] sm:gap-2 sm:text-[10px] ${activeHeroSlide.accent}`}><HeroIcon size={13} strokeWidth={2.2} /> {activeHeroSlide.eyebrow}</span>
            <h1 className="mt-2 font-display text-[1.55rem] font-semibold leading-[1.03] tracking-[-.045em] text-white sm:mt-3 sm:text-[2.7rem]">{activeHeroSlide.title}</h1>
            <p className="mt-2 max-w-[19rem] text-[10px] leading-relaxed text-white/75 sm:mt-3 sm:text-sm">{activeHeroSlide.description}</p>
            <button type="button" onClick={() => navigate(activeHeroSlide.category ? `/categories/${encodeURIComponent(activeHeroSlide.category)}` : '/categories')} className="mt-3 inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 text-[9px] font-bold text-[#174b39] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#e9f4e9] sm:mt-5 sm:h-11 sm:gap-2 sm:px-5 sm:text-xs">{activeHeroSlide.action} <ArrowRight size={12} className="shrink-0 sm:h-[13px] sm:w-[13px]" /></button>
          </div>
          <div className="absolute bottom-4 right-5 z-10 flex items-center gap-1.5 sm:bottom-6 sm:right-8" aria-label="Choose highlight">
            {heroSlides.map((slide, index) => (
              <button key={slide.title} type="button" aria-label={`Show ${slide.title}`} aria-current={index === heroSlideIndex} onClick={() => setHeroSlideIndex(index)} className={`h-1.5 rounded-full transition-all ${index === heroSlideIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/75'}`} />
            ))}
          </div>
        </section>
      )}

      {!categoryScreen && (
        <section id="browse-categories" className="scroll-mt-28 pt-7 sm:scroll-mt-32 sm:pt-10">
          <div className="mb-4 flex items-end justify-between gap-3 sm:mb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--brand-primary)] sm:text-xs">A market in a few taps</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-[-.045em] text-[var(--text-primary)] sm:text-4xl">Shop by category</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)] sm:text-lg">Fresh picks for every meal.</p>
            </div>
            <Link to="/categories" className="mb-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--brand-secondary)] bg-[var(--brand-primary-soft)] px-3 text-[11px] font-bold text-[var(--brand-primary)] transition hover:bg-[var(--brand-secondary)] sm:h-11 sm:gap-2 sm:px-5 sm:text-sm">See all <ArrowRight size={15} /></Link>
          </div>
          {categoriesError && <p role="alert" className="mb-3 rounded-xl bg-[var(--status-danger-soft)] px-3 py-2 text-xs text-[var(--status-danger)]">We couldn’t load categories from the store. <button type="button" onClick={refetchCategories} className="font-bold underline">Try again</button></p>}
          {categoriesLoading && <p role="status" className="mb-3 text-xs text-[var(--text-secondary)]">Loading store categories…</p>}
          {!categoriesLoading && !categoriesError && homeCategories.length > 0 && <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-5">
            {homeCategories.map((item, index) => (
              <Link key={item.id} to={`/categories/${encodeURIComponent(item.id)}`} className="category-tile group min-w-0 overflow-hidden rounded-[16px] border border-[var(--border-default)] bg-white text-left shadow-[0_8px_24px_-20px_rgba(17,44,31,.45)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-secondary)] hover:shadow-[0_14px_28px_-20px_rgba(17,44,31,.42)] sm:rounded-[24px]">
                <span className="block aspect-[1.2] overflow-hidden sm:aspect-[1.4]" style={{ backgroundColor: categoryTints[index % categoryTints.length] }}>
                  <CategoryPhoto category={item.label} imageUrl={item.imageUrl} placeholderOnly className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
                </span>
                <span className="flex min-h-[52px] items-center gap-1 px-2 py-2 sm:min-h-[78px] sm:gap-3 sm:px-4 sm:py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-extrabold leading-tight tracking-[-.025em] text-[var(--text-primary)] sm:text-base">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[8px] leading-3 text-[var(--text-secondary)] sm:mt-1 sm:text-xs sm:leading-4">Fresh picks from your store</span>
                  </span>
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)] transition group-hover:bg-[var(--brand-primary)] group-hover:text-white sm:h-10 sm:w-10">
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5 sm:h-[18px] sm:w-[18px]" />
                  </span>
                </span>
              </Link>
            ))}
          </div>}
        </section>
      )}

      <section id="products" className={`scroll-mt-20 ${categoryScreen ? 'pt-2 sm:pt-5' : 'pt-8 sm:scroll-mt-24 sm:pt-12'}`}>
        <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-4">
          <div>
            {categoryScreen ? (
              <Link to="/categories" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand-primary)]"><ArrowRight className="rotate-180" size={15} /> All categories</Link>
            ) : (
              <p className="text-[9px] font-bold uppercase tracking-[.15em] text-[var(--brand-primary)] sm:text-[10px] sm:tracking-[.19em]">From your neighbourhood store</p>
            )}
            <h1 className="mt-1 text-xl font-bold tracking-[-.035em] text-[var(--text-primary)] sm:text-[2rem]">{categoryScreen ? formatCategoryLabel(category) : 'The fresh edit'}</h1>
          </div>
          <p className="text-[10px] text-[var(--text-secondary)] sm:text-xs">{selectedStore?.storeName || 'Choose your nearby store'}</p>
        </div>

        <div className="mt-4 grid gap-3 sm:mt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-4">
          {!categoryScreen && (
            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--text-secondary)]">Shop by category</p>
                <span className="text-[10px] text-[var(--text-secondary)] sm:hidden">Swipe to explore</span>
              </div>
              <div aria-label="Product categories" className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto pb-1 sm:gap-1.5">
                {categories.map((item) => (
                  <Link key={item.id} to={item.id ? `/categories/${encodeURIComponent(item.id)}` : '/'} className="shrink-0 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)] hover:text-[var(--text-primary)] sm:px-3.5 sm:py-2 sm:text-[11px]">{item.label}</Link>
                ))}
              </div>
            </div>
          )}
          <label className="flex h-11 min-w-0 items-center gap-3 rounded-xl border border-[var(--border-default)] bg-white px-3.5 text-[var(--text-secondary)] sm:h-10 sm:min-w-[190px]">
            <ArrowDownWideNarrow size={16} strokeWidth={1.8} />
            <span className="shrink-0 text-xs font-semibold text-[var(--text-secondary)]">Sort by</span>
            <select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)} className="min-w-0 flex-1 bg-transparent text-right text-xs font-semibold text-[var(--text-secondary)] outline-none">
              <option value="recommended">Recommended</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="name">Name: A–Z</option>
            </select>
          </label>
        </div>

        <div className="mt-1.5 flex min-h-4 items-center justify-between sm:mt-4 sm:min-h-5">
          <p className="text-[10px] text-[var(--text-secondary)] sm:text-[11px]">{selectedStore ? `${selectedStore.storeName}${data?.pagination ? ` · ${usingCatalogFallback ? products.length : data.pagination.total} items` : ''}` : 'Choose a store to see its selection'}</p>
          {isFetching && !isLoading && <span className="text-[11px] text-[var(--text-secondary)]">Updating selection…</span>}
        </div>
        {(isLoading || (isFetching && !data)) && <div className="mt-4 rounded-2xl border border-[var(--border-default)] bg-white"><CookingLoader compact label="Finding fresh picks for you…" /></div>}
        {error && <div role="alert" className="mt-5 rounded-2xl border border-[#e8d9d2] bg-[#fbf5f2] p-5 text-sm text-[var(--text-secondary)]"><p className="font-semibold">We couldn’t load the selection.</p><p className="mt-1 text-xs">{getErrorMessage(error)}</p><button onClick={refetch} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline"><RotateCw size={13} /> Try again</button></div>}
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
