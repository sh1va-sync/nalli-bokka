import { useState } from 'react'
import { getCategoryPhoto } from './categoryAssets.js'

export default function CategoryPhoto({ category, imageUrl, className = '' }) {
  const [failedImage, setFailedImage] = useState('')
  const fallbackImage = getCategoryPhoto(category)
  const image = imageUrl && failedImage !== imageUrl ? imageUrl : fallbackImage

  return failedImage === image
    ? <span className={`grid h-full w-full place-items-center bg-[var(--brand-primary-soft)] text-[10px] font-medium capitalize text-[var(--text-secondary)] ${className}`}>{category.replace(/[-_]/g, ' ')}</span>
    : <img src={image} alt="" loading="lazy" className={className} onError={() => setFailedImage(image)} />
}
