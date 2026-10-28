import { useMemo, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { useGetProductCategoriesQuery } from '../../api/api.js'
import CategoryPhoto from '../components/CategoryPhoto.jsx'
import { formatCategoryLabel } from '../hooks/useProductCatalog.js'

const categoryTints = ['#edf5e9', '#fff2e3', '#fcebea', '#eaf3f8', '#f5f0e7']

export default function CategoriesPage() {
  const selectedStore = useSelector((state) => state.selectedStore)
  const { data: categoriesResponse, isLoading, error, refetch } = useGetProductCategoriesQuery(
    { storeId: selectedStore?._id },
    { skip: !selectedStore?._id },
  )
  const [search, setSearch] = useState('')
  const categories = useMemo(() => {
    return (categoriesResponse?.data || []).map((name, index) => ({
      id: name,
      label: formatCategoryLabel(name),
      tint: categoryTints[index % categoryTints.length],
      imageUrl: categoriesResponse?.images?.[name],
    }))
  }, [categoriesResponse?.data, categoriesResponse?.images])
  const filteredCategories = categories.filter(({ label }) => label.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="mx-auto min-h-[calc(100dvh-150px)] max-w-6xl px-4 pb-10 pt-7 sm:px-6 sm:pt-9 lg:px-8">
      <header className="mb-6 sm:mb-8">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--text-secondary)] sm:text-sm">Find your favourites</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-.045em] text-[var(--text-primary)] sm:text-5xl">Shop by category</h1>
        <p className="mt-2 text-base text-[var(--text-secondary)] sm:text-2xl">Fresh picks for every meal.</p>
      </header>

      <label className="flex h-14 items-center gap-3 rounded-[20px] border border-[var(--border-default)] bg-white px-4 text-[var(--text-secondary)] shadow-[0_6px_20px_-15px_rgba(18,49,37,.35)] transition focus-within:border-[var(--brand-secondary)] focus-within:shadow-[0_0_0_4px_rgba(23,97,73,.08)] sm:h-[76px] sm:gap-4 sm:rounded-[26px] sm:px-7">
        <Search size={24} strokeWidth={1.8} className="shrink-0" />
        <input aria-label="Search categories" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${categories.length} categories`} className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] sm:text-2xl" />
      </label>

      {error && <p role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]"><span>We couldn’t load categories from the store.</span><button type="button" onClick={refetch} className="font-bold underline">Try again</button></p>}
      {isLoading && <p role="status" className="mt-5 text-sm text-[var(--text-secondary)]">Loading categories…</p>}
      {!isLoading && !error && filteredCategories.length > 0 && <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5 lg:grid-cols-3">
        {filteredCategories.map((category) => <Link key={category.id} to={`/categories/${encodeURIComponent(category.id)}`} className="group min-w-0 overflow-hidden rounded-[20px] border border-[var(--border-default)] bg-white shadow-[0_8px_24px_-20px_rgba(17,44,31,.45)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-secondary)] hover:shadow-[0_14px_28px_-20px_rgba(17,44,31,.42)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)] sm:rounded-[26px]">
          <span className="block aspect-[1.48] overflow-hidden" style={{ backgroundColor: category.tint }}>
            <CategoryPhoto category={category.label} imageUrl={category.imageUrl} placeholderOnly className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          </span>
          <span className="flex min-h-[74px] items-center gap-2 px-3 py-3 sm:min-h-[96px] sm:px-6 sm:py-4">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold leading-tight tracking-[-.025em] text-[var(--text-primary)] sm:text-2xl">{category.label}</span>
            </span>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)] transition group-hover:bg-[var(--brand-primary)] group-hover:text-white sm:h-[52px] sm:w-[52px]">
              <ArrowRight size={19} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5 sm:h-6 sm:w-6" />
            </span>
          </span>
        </Link>)}
      </div>}
      {!isLoading && !error && filteredCategories.length === 0 && <p className="mt-8 rounded-2xl bg-white p-8 text-center text-sm text-[var(--text-secondary)]">{categories.length === 0 ? 'This store hasn’t added any categories yet.' : `No categories match “${search}”. Try another search.`}</p>}
    </div>
  )
}
