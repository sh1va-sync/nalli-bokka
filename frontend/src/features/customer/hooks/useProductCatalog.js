import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useGetProductCategoriesQuery, useGetProductsQuery } from '../../api/api.js'
import { getProductStoreId } from '../utils.js'

const builtInCategories = [
  { id: 'vegetable', label: 'Vegetables' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'meat', label: 'Meat & fish' },
  { id: 'rice', label: 'Rice & grains' },
  { id: 'oil', label: 'Oils' },
]
const builtInCategoryIds = new Set(builtInCategories.map(({ id }) => id))
const categoryTints = ['#edf5e9', '#fff2e3', '#fcebea', '#eaf3f8', '#f5f0e7']

export function formatCategoryLabel(name) {
  return name.split(/\s+/).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ')
}

export function useProductCatalog({ categoryScreen = false, categoryId = '' }) {
  const selectedStore = useSelector((state) => state.selectedStore)
  const { data: categoriesResponse } = useGetProductCategoriesQuery(
    { storeId: selectedStore?._id },
    { skip: !selectedStore?._id },
  )
  const [search, setSearch] = useState('')
  const [querySearch, setQuerySearch] = useState('')
  const [sort, setSort] = useState('recommended')
  const [pageState, setPageState] = useState({ storeId: null, category: '', search: '', page: 1 })

  const category = categoryScreen ? categoryId : ''
  const categories = useMemo(() => [
    { id: '', label: 'All' },
    ...builtInCategories,
    ...(categoriesResponse?.data || [])
      .filter((name) => !builtInCategoryIds.has(name))
      .map((name) => ({ id: name, label: formatCategoryLabel(name) })),
  ].map((category) => ({
    ...category,
    imageUrl: categoriesResponse?.images?.[category.id],
  })), [categoriesResponse?.data, categoriesResponse?.images])

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
  }), [data?.data, fallbackProducts, sort, usingCatalogFallback])

  const browseCategories = categories.filter(({ id }) => id)

  return {
    category,
    categories,
    browseCategories,
    categoryTints,
    search,
    setSearch,
    querySearch,
    sort,
    setSort,
    setPageState,
    page,
    products,
    pageState,
    selectedStore,
    error,
    isLoading,
    isFetching,
    refetch,
    storeFilterReturnedNoProducts,
    usingCatalogFallback,
    data,
  }
}
