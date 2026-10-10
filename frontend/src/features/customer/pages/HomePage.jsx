import { useEffect, useMemo, useState } from 'react'
import { ArrowDownWideNarrow, ArrowRight, Leaf, RotateCw, Search } from 'lucide-react'
import { useSelector } from 'react-redux'
import { useGetProductsQuery } from '../../api/api.js'
import ProductCard from '../components/ProductCard.jsx'
import { getErrorMessage, getProductStoreId } from '../utils.js'

const categories = [
  { id: '', label: 'All' },
  { id: 'vegetable', label: 'Vegetables' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'meat', label: 'Meat & fish' },
  { id: 'rice', label: 'Rice & grains' },
  { id: 'oil', label: 'Oils' },
]

export default function HomePage() {
  const selectedStore = useSelector((state) => state.selectedStore)
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [querySearch, setQuerySearch] = useState('')
  const [sort, setSort] = useState('recommended')
  const [pageState, setPageState] = useState({ storeId: null, category: '', search: '', page: 1 })
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

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuerySearch(search), 250)
    return () => window.clearTimeout(timeout)
  }, [search])

  const products = useMemo(() => [...(usingCatalogFallback ? fallbackProducts || [] : data?.data || [])].sort((a, b) => {
    if (sort === 'price-low') return (a.pricePerKg ?? a.packs?.[0]?.price ?? 0) - (b.pricePerKg ?? b.packs?.[0]?.price ?? 0)
    if (sort === 'price-high') return (b.pricePerKg ?? b.packs?.[0]?.price ?? 0) - (a.pricePerKg ?? a.packs?.[0]?.price ?? 0)
    if (sort === 'name') return a.productName.localeCompare(b.productName)
    return 0
  }), [usingCatalogFallback, fallbackProducts, data?.data, sort])

  return (
    <div className="mx-auto max-w-7xl px-3 pb-4 pt-2.5 sm:px-6 sm:pt-8 lg:px-8">
      <section className="relative overflow-hidden rounded-[16px] border border-[#f0dfd8] bg-[linear-gradient(120deg,#fbf0eb_0%,#f8ece5_55%,#f7f0e7_100%)] px-4 py-3 sm:rounded-[18px] sm:px-8 sm:py-6">
        <div className="absolute -right-16 -top-28 h-56 w-56 rounded-full border border-[#e9cfc6] sm:right-20" />
        <div className="absolute -right-7 -top-16 h-40 w-40 rounded-full border border-[#e9cfc6]" />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[.16em] text-[#9b5148] sm:gap-2 sm:text-[9px] sm:tracking-[.18em]"><Leaf size={11} strokeWidth={1.7} /> A little closer to fresh</span>
          <h1 className="mt-1 font-display text-[1.3rem] font-medium leading-tight tracking-[-.04em] text-[#392824] sm:mt-2 sm:text-[2.2rem]">Good things, picked for today.</h1>
          <p className="mt-1 hidden max-w-lg text-[13px] leading-5 text-[#796b64] sm:block">Market-fresh produce, pantry staples and local favourites.</p>
          <a href="#products" className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#861923] transition hover:text-[#70131c] sm:mt-3 sm:gap-2 sm:text-[11px]">Explore the selection <ArrowRight size={12} /></a>
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

        <div className="mt-2.5 flex items-center justify-between gap-2 sm:mt-5 sm:flex-wrap sm:gap-3">
          <div className="no-scrollbar flex min-w-0 max-w-full gap-1 overflow-x-auto pb-1 sm:gap-1.5">
            {categories.map((item) => <button key={item.id} onClick={() => setCategory(item.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-medium transition sm:px-3.5 sm:py-2 sm:text-[11px] ${category === item.id ? 'bg-[#861923] text-white shadow-[0_3px_10px_-5px_rgba(91,14,25,.55)]' : 'text-[#82736d] hover:bg-[#f5e8e3] hover:text-[#493631]'}`}>{item.label}</button>)}
          </div>
          <label className="flex shrink-0 items-center gap-1 text-[10px] text-[#838478] sm:gap-2 sm:text-[11px]"><ArrowDownWideNarrow size={13} strokeWidth={1.7} /><span className="hidden sm:inline">Sort by</span><select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)} className="max-w-[86px] bg-transparent text-[10px] font-medium text-[#4d5045] outline-none sm:max-w-none sm:text-[11px]"><option value="recommended">Recommended</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A–Z</option></select></label>
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
