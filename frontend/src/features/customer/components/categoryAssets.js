const categoryPhotos = {
  vegetable: '/categories/fresh-produce.png',
  fruit: '/categories/fresh-fruit.png',
  meat: '/categories/meat.png',
  fish: '/categories/meat.png',
  seafood: '/categories/meat.png',
  rice: '/categories/rice-grains.png',
  grain: '/categories/rice-grains.png',
  atta: '/categories/rice-grains.png',
  dal: '/categories/rice-grains.png',
  pulse: '/categories/rice-grains.png',
  oil: '/categories/pantry-oils.png',
  pantry: '/categories/pantry-oils.png',
  dairy: '/categories/dairy-eggs.png',
  egg: '/categories/dairy-eggs.png',
  milk: '/categories/dairy-eggs.png',
  bread: '/categories/bakery.png',
  bakery: '/categories/bakery.png',
}

export function getCategoryPhoto(category = '') {
  const normalizedCategory = category.trim().toLowerCase()
  const exactMatch = categoryPhotos[normalizedCategory]
  if (exactMatch) return exactMatch

  const match = Object.keys(categoryPhotos).find((keyword) => normalizedCategory.includes(keyword))
  if (match) return categoryPhotos[match]
  if (normalizedCategory.includes('beverage') || normalizedCategory.includes('drink') || normalizedCategory.includes('snack')) {
    return '/categories/pantry-oils.png'
  }
  return '/categories/fresh-produce.png'
}
