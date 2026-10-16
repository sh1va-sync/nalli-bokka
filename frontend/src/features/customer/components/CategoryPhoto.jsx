import { useState } from 'react'
import { getCategoryPhoto } from './categoryAssets.js'

export default function CategoryPhoto({ category, className = '' }) {
  const [imageError, setImageError] = useState(false)
  const image = getCategoryPhoto(category)

  return imageError
    ? <span className={`grid h-full w-full place-items-center bg-[var(--brand-primary-soft)] text-[10px] font-medium capitalize text-[var(--text-secondary)] ${className}`}>{category.replace(/[-_]/g, ' ')}</span>
    : <img src={image} alt="" loading="lazy" className={className} onError={() => setImageError(true)} />
}
