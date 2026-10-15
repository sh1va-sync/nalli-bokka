import { useEffect, useMemo, useState } from 'react'
import { Apple, ArrowDownWideNarrow, ArrowRight, ChevronLeft, ChevronRight, Leaf, Pause, Play, RotateCw, Search, Wheat } from 'lucide-react'
import { useSelector } from 'react-redux'
import { useGetProductCategoriesQuery, useGetProductsQuery } from '../../api/api.js'
import ProductCard from '../components/ProductCard.jsx'
import { getErrorMessage, getProductStoreId } from '../utils.js'

const builtInCategories = [
  { id: 'vegetable', label: 'Vegetables' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'meat', label: 'Meat & fish' },
  { id: 'rice', label: 'Rice & grains' },
  { id: 'oil', label: 'Oils' },
]
const builtInCategoryIds = new Set(builtInCategories.map(({ id }) => id))

function formatCategoryLabel(name) {
  return name.split(/\s+/).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ')
}

const heroSlides = [
  {
    eyebrow: 'Picked fresh today',
    title: 'Fresh picks',
    image: '/hero/fresh-picks.svg',
    imageAlt: 'Illustration of fresh apples and citrus in a market bowl',
    icon: Apple,
    action: 'Shop fresh picks',
    category: '',
    theme: 'from-[#fff1e8] via-[#fbe9df] to-[#f6dfd4]',
    accent: 'text-[#a43e37]',
  },
  {
    eyebrow: 'Straight from the market',
    title: 'Market greens',
    image: '/hero/green-market.svg',
    imageAlt: 'Illustration of leafy greens and vegetables in a market basket',
    icon: Leaf,
    action: 'Shop vegetables',
    category: 'vegetable',
    theme: 'from-[#eef5e7] via-[#e7f0dc] to-[#e0ead4]',
    accent: 'text-[#3f7048]',
  },
  {
    eyebrow: 'Good food, close to home',
    title: 'Pantry favourites',
    image: '/hero/pantry-favourites.svg',
    imageAlt: 'Illustration of rice and pantry staples',
    icon: Wheat,
    action: 'Shop pantry picks',
    category: 'rice',
    theme: 'from-[#fbf1dc] via-[#f6e8cc] to-[#f0dfc2]',
    accent: 'text-[#94613c]',
  },
]

export default function HomePage() {
  const selectedStore = useSelector((state) => state.selectedStore)
  const { data: categoriesResponse } = useGetProductCategoriesQuery()
  const [heroSlideIndex, setHeroSlideIndex] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  const [heroInteractionPaused, setHeroInteractionPaused] = useState(false)
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [querySearch, setQuerySearch] = useState('')
  const [sort, setSort] = useState('recommended')
  const [pageState, setPageState] = useState({ storeId: null, category: '', search: '', page: 1 })
  const categories = useMemo(() => [
    { id: '', label: 'All' },
    ...builtInCategories,
    ...(categoriesResponse?.data || [])
      .filter((name) => !builtInCategoryIds.has(name))
      .map((name) => ({ id: name, label: formatCategoryLabel(name) })),
  ], [categoriesResponse?.data])
  const pageKeyMatches = pageState.storeId === selectedStore?._id && pageState.category === category && pageState.search === querySearch
  const page = pageKeyMatches ? pageState.page : 1
  const { currentData: storeProducts, error: storeProductsError, isLoading: storeProductsLoading, isFetching: storeProductsFetching, refetch } = useGetProductsQuery({
    storeId: selectedStore?._id,
    productType: category || undefined,
    search: querySearch.trim() || undefined,
    page,
    limit: 24,
  }, { skip: !selectedStore })
  const storeFilterReturnedNoProducts = storeProducts?.pagination?.total === 0
  const { currentData: catalogProducts, error: catalogError, isLoading: catalogLoading, isFetching: catalogFetching } = useGetProductsQuery({
    productType: category || undefined,
    search: querySearch.trim() || undefined,
    page,
    limit: 100,
  }, { skip: !selectedStore || !storeFilterReturnedNoProducts })
  const usingCatalogFallback = Boolean(storeFilterReturnedNoProducts && catalogProducts)
  const data = usingCatalogFallback ? catalogProducts : storeProducts
  const fallbackProducts = useMemo(() => usingCatalogFallback
    ? (catalogProducts?.data || []).filter((product) => getProductStoreId(product) === selectedStore?._id)
    : null, [usingCatalogFallback, catalogProducts?.data, selectedStore?._id])
  const error = catalogError || storeProductsError
  const isLoading = storeProductsLoading || (storeFilterReturnedNoProducts && catalogLoading)
  const isFetching = storeProductsFetching || (storeFilterReturnedNoProducts && catalogFetching)
  const activeHeroSlide = heroSlides[heroSlideIndex]
  const HeroIcon = activeHeroSlide.icon

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuerySearch(search), 250)
    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    if (heroPaused || heroInteractionPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const interval = window.setInterval(() => {
      setHeroSlideIndex((current) => (current + 1) % heroSlides.length)
    }, 6000)
    return () => window.clearInterval(interval)
  }, [heroPaused, heroInteractionPaused, heroSlideIndex])

  function showHeroSlide(index) {
    setHeroSlideIndex((index + heroSlides.length) % heroSlides.length)
  }

  const products = useMemo(() => [...(usingCatalogFallback ? fallbackProducts || [] : data?.data || [])].sort((a, b) => {
    if (sort === 'price-low') return (a.pricePerKg ?? a.packs?.[0]?.price ?? 0) - (b.pricePerKg ?? b.packs?.[0]?.price ?? 0)
    if (sort === 'price-high') return (b.pricePerKg ?? b.packs?.[0]?.price ?? 0) - (a.pricePerKg ?? a.packs?.[0]?.price ?? 0)
    if (sort === 'name') return a.productName.localeCompare(b.productName)
    return 0
  }), [usingCatalogFallback, fallbackProducts, data?.data, sort])

  return (
    <div className="mx-auto max-w-7xl px-3 pb-4 pt-2.5 sm:px-6 sm:pt-8 lg:px-8">
      <section
        aria-label="Store highlights"
        aria-roledescription="carousel"
        className={`relative min-h-[218px] overflow-hidden rounded-[20px] border border-white/70 bg-gradient-to-br px-4 py-4 shadow-[0_12px_34px_-26px_rgba(73,43,30,.4)] transition-colors duration-700 sm:min-h-[270px] sm:rounded-[24px] sm:px-8 sm:py-7 ${activeHeroSlide.theme}`}
        onMouseEnter={() => setHeroInteractionPaused(true)}
        onMouseLeave={() => setHeroInteractionPaused(false)}
        onFocusCapture={() => setHeroInteractionPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHeroInteractionPaused(false)
        }}
      >
        <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-white/65 sm:right-16 sm:h-72 sm:w-72" />
        <div className="pointer-events-none absolute -right-5 -top-12 h-40 w-40 rounded-full border border-white/55 sm:right-24 sm:h-56 sm:w-56" />
        <img
          key={activeHeroSlide.image}
          src={activeHeroSlide.image}
          alt={activeHeroSlide.imageAlt}
          className="pointer-events-none absolute -right-3 top-1/2 h-[88%] w-[59%] -translate-y-1/2 object-contain drop-shadow-[0_18px_18px_rgba(74,47,32,.16)] transition-transform duration-500 sm:right-7 sm:h-[94%] sm:w-[48%]"
        />
        <div key={heroSlideIndex} role="group" aria-roledescription="slide" aria-label={`${heroSlideIndex + 1} of ${heroSlides.length}`} className="relative z-10 max-w-[62%] pb-12 sm:max-w-[52%] sm:pb-10">
          <span className={`inline-flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[.14em] sm:gap-2 sm:text-[10px] ${activeHeroSlide.accent}`}><HeroIcon size={13} strokeWidth={2.2} /> {activeHeroSlide.eyebrow}</span>
          <h1 className="mt-2 font-display text-[1.55rem] font-semibold leading-[1.03] tracking-[-.045em] text-[#392824] sm:mt-3 sm:text-[2.7rem]">{activeHeroSlide.title}</h1>
          <a
            href="#products"
            onClick={() => setCategory(activeHeroSlide.category)}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-full bg-[#861923] px-4 text-[10px] font-bold text-white shadow-[0_5px_14px_-6px_rgba(91,14,25,.7)] transition hover:-translate-y-0.5 hover:bg-[#70131c] sm:mt-5 sm:h-10 sm:px-5 sm:text-xs"
          >
            {activeHeroSlide.action} <ArrowRight size={13} />
          </a>
        </div>
        <div className="absolute bottom-3 left-4 right-4 z-10 flex items-center justify-between sm:bottom-5 sm:left-8 sm:right-7">
          <div className="flex items-center gap-1.5" aria-label="Choose a slide">
            {heroSlides.map((slide, index) => <button
              key={slide.eyebrow}
              type="button"
              aria-label={`Show slide ${index + 1}: ${slide.title}`}
              aria-current={heroSlideIndex === index ? 'true' : undefined}
              onClick={() => showHeroSlide(index)}
              className={`h-2.5 rounded-full transition-all ${heroSlideIndex === index ? 'w-7 bg-[#861923]' : 'w-2.5 bg-[#917b6e]/55 hover:bg-[#861923]/70'}`}
            />)}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous highlight" onClick={() => showHeroSlide(heroSlideIndex - 1)} className="grid h-8 w-8 place-items-center rounded-full border border-white/80 bg-white/70 text-[#5d4b41] shadow-sm transition hover:bg-white sm:h-9 sm:w-9"><ChevronLeft size={16} /></button>
            <button type="button" aria-label="Next highlight" onClick={() => showHeroSlide(heroSlideIndex + 1)} className="grid h-8 w-8 place-items-center rounded-full border border-white/80 bg-white/70 text-[#5d4b41] shadow-sm transition hover:bg-white sm:h-9 sm:w-9"><ChevronRight size={16} /></button>
            <button type="button" aria-label={heroPaused ? 'Play carousel' : 'Pause carousel'} onClick={() => setHeroPaused((paused) => !paused)} className="grid h-8 w-8 place-items-center rounded-full border border-white/80 bg-white/70 text-[#5d4b41] shadow-sm transition hover:bg-white sm:h-9 sm:w-9">{heroPaused ? <Play size={13} /> : <Pause size={13} />}</button>
          </div>
        </div>
      </section>

      <section id="products" className="scroll-mt-20 pt-5 sm:scroll-mt-24 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-4">
          <div>
            <p className="text-[8px] font-semibold uppercase tracking-[.15em] text-[#8b8c7e] sm:text-[10px] sm:tracking-[.19em]">From your neighbourhood store</p>
            <h2 className="mt-0.5 font-display text-[1.45rem] font-medium tracking-[-.035em] text-[#292c25] sm:mt-1 sm:text-[2rem]">The fresh edit</h2>
          </div>
          <label className="flex h-9 min-w-full items-center gap-2 rounded-full border border-[#e5e2d9] bg-[#fcfbf8] px-3 text-[#8a8a7e] focus-within:border-[#9c9e8b] sm:ml-auto sm:h-10 sm:min-w-[210px] sm:flex-1 sm:gap-2.5 sm:px-3.5 sm:max-w-xs">
            <Search size={15} strokeWidth={1.8} />
            <input aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" className="w-full bg-transparent text-[11px] text-[#30332b] outline-none placeholder:text-[#a3a297] sm:text-xs" />
            {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="text-xs text-[#858679]">Clear</button>}
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:mt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#82736d]">Shop by category</p>
              <span className="text-[10px] text-[#9a8b83] sm:hidden">Swipe to explore</span>
            </div>
            <div aria-label="Product categories" className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto pb-1 sm:gap-1.5">
              {categories.map((item) => <button key={item.id} onClick={() => setCategory(item.id)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition sm:px-3.5 sm:py-2 sm:text-[11px] ${category === item.id ? 'border-[#861923] bg-[#861923] text-white shadow-[0_3px_10px_-5px_rgba(91,14,25,.55)]' : 'border-[#e8ded5] bg-white text-[#6f625c] hover:border-[#d7b8ac] hover:bg-[#fff8f4] hover:text-[#493631]'}`}>{item.label}</button>)}
            </div>
          </div>
          <label className="flex h-11 min-w-0 items-center gap-3 rounded-xl border border-[#e5e2d9] bg-white px-3.5 text-[#77756b] sm:h-10 sm:min-w-[190px]">
            <ArrowDownWideNarrow size={16} strokeWidth={1.8} />
            <span className="shrink-0 text-xs font-semibold text-[#625a54]">Sort by</span>
            <select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)} className="min-w-0 flex-1 bg-transparent text-right text-xs font-semibold text-[#39352f] outline-none">
              <option value="recommended">Recommended</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="name">Name: A–Z</option>
            </select>
          </label>
        </div>

        <div className="mt-1.5 flex min-h-4 items-center justify-between sm:mt-4 sm:min-h-5">
          <p className="text-[10px] text-[#929286] sm:text-[11px]">{selectedStore ? `${selectedStore.storeName}${data?.pagination ? ` · ${usingCatalogFallback ? fallbackProducts.length : data.pagination.total} items` : ''}` : 'Choose a store to see its selection'}</p>
          {isFetching && !isLoading && <span className="text-[11px] text-[#737b63]">Updating selection…</span>}
        </div>
        {(isLoading || (isFetching && !data)) && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="animate-pulse rounded-[16px] bg-white p-3"><div className="aspect-square rounded-xl bg-[#eeede6]" /><div className="mt-4 h-3 w-2/3 rounded bg-[#eeede6]" /><div className="mt-2 h-3 w-1/2 rounded bg-[#eeede6]" /></div>)}</div>}
        {error && <div role="alert" className="mt-5 rounded-2xl border border-[#e8d9d2] bg-[#fbf5f2] p-5 text-sm text-[#825b4d]"><p className="font-semibold">We couldn’t load the selection.</p><p className="mt-1 text-xs">{getErrorMessage(error)}</p><button onClick={refetch} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline"><RotateCw size={13} /> Try again</button></div>}
        {usingCatalogFallback && <p role="status" className="mt-3 text-[10px] text-[#8c8069]">Showing products matched to this store.</p>}
        {!selectedStore && !error && <div className="mt-5 rounded-2xl bg-white px-5 py-12 text-center text-sm text-[#858579]">Choose a store to browse its available products.</div>}
        {!isLoading && !isFetching && !error && selectedStore && products.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">{products.map((product) => <ProductCard key={product._id} product={product} />)}</div>}
        {!isLoading && !isFetching && !error && selectedStore && products.length === 0 && <div className="mt-5 rounded-2xl bg-white px-6 py-14 text-center"><h3 className="font-display text-xl text-[#45483e]">Nothing here just yet</h3><p className="mt-1 text-sm text-[#858579]">Try another category or search term.</p></div>}
        {data?.pagination?.pages > 1 && <div className="mt-7 flex items-center justify-center gap-3"><button disabled={page <= 1 || isFetching} onClick={() => setPageState({ storeId: selectedStore._id, category, search: querySearch, page: page - 1 })} className="rounded-full border border-[#dfddd4] px-4 py-2 text-xs font-medium text-[#515448] transition hover:bg-white disabled:opacity-40">Previous</button><span className="text-[11px] text-[#898a7f]">Page {page} of {data.pagination.pages}</span><button disabled={page >= data.pagination.pages || isFetching} onClick={() => setPageState({ storeId: selectedStore._id, category, search: querySearch, page: page + 1 })} className="rounded-full border border-[#dfddd4] px-4 py-2 text-xs font-medium text-[#515448] transition hover:bg-white disabled:opacity-40">Next</button></div>}
      </section>
    </div>
  )
}
