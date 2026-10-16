import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useGetProductCategoriesQuery } from '../../api/api.js'
import CategoryPhoto from '../components/CategoryPhoto.jsx'

const builtInCategories = [
  { id: 'vegetable', label: 'Vegetables', tint: '#edf5e9', note: 'Fresh from the market' },
  { id: 'fruit', label: 'Fruit', tint: '#fff2e3', note: 'Naturally sweet picks' },
  { id: 'meat', label: 'Meat & fish', tint: '#fcebea', note: 'Quality cuts, chosen fresh' },
  { id: 'rice', label: 'Rice & grains', tint: '#eaf3f8', note: 'Everyday pantry staples' },
  { id: 'oil', label: 'Oils', tint: '#f5f0e7', note: 'Kitchen essentials' },
]

function formatCategoryLabel(name) {
  return name.split(/\s+/).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ')
}

export default function CategoriesPage() {
  const { data: categoriesResponse, isLoading, error } = useGetProductCategoriesQuery()
  const [search, setSearch] = useState('')
  const categories = useMemo(() => {
    const builtInIds = new Set(builtInCategories.map(({ id }) => id))
    const additional = (categoriesResponse?.data || [])
      .filter((name) => !builtInIds.has(name))
      .map((name) => ({
        id: name,
        label: formatCategoryLabel(name),
        tint: '#f5f0e7',
        note: 'Explore the selection',
      }))
    return [...builtInCategories, ...additional]
  }, [categoriesResponse?.data])
  const filteredCategories = categories.filter(({ label }) => label.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="mx-auto min-h-[calc(100dvh-150px)] max-w-4xl px-4 pb-8 pt-5 sm:px-6 sm:pt-9">
      <header className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--brand-primary)]">Find your favourites</p>
        <h1 className="mt-1 text-2xl font-bold tracking-[-.04em] text-[var(--text-primary)] sm:text-3xl">Categories</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Browse the market, one aisle at a time.</p>
      </header>

      <label className="flex h-12 items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-white px-4 text-[var(--text-secondary)] shadow-[0_3px_14px_-10px_rgba(18,49,37,.35)] focus-within:border-[var(--brand-primary)]">
        <Search size={18} />
        <input aria-label="Search categories" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search categories" className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]" />
      </label>

      {error && <p role="alert" className="mt-4 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">We couldn’t load all categories. Showing the main categories instead.</p>}
      {isLoading && <p role="status" className="mt-5 text-sm text-[var(--text-secondary)]">Loading categories…</p>}
      {!isLoading && filteredCategories.length > 0 && <div className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 md:grid-cols-5">
        {filteredCategories.map((category) => <Link key={category.id} to={`/categories/${encodeURIComponent(category.id)}`} className="group min-w-0 overflow-hidden rounded-[19px] border border-[var(--border-default)] bg-white p-1.5 shadow-[0_5px_16px_-14px_rgba(17,44,31,.4)] transition hover:-translate-y-0.5 hover:border-[var(--brand-secondary)] hover:shadow-lg sm:rounded-[22px] sm:p-2">
          <span className="block aspect-square overflow-hidden rounded-[14px] sm:rounded-[17px]" style={{ backgroundColor: category.tint }}>
            <CategoryPhoto category={category.id} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
          </span>
          <span className="block min-h-10 px-1 pb-1 pt-2 text-center text-[11px] font-bold leading-4 text-[var(--text-primary)] sm:text-[13px]">{category.label}</span>
        </Link>)}
      </div>}
      {!isLoading && filteredCategories.length === 0 && <p className="mt-8 rounded-2xl bg-white p-8 text-center text-sm text-[var(--text-secondary)]">No categories match “{search}”. Try another search.</p>}
    </div>
  )
}
