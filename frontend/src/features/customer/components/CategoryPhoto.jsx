import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { getCategoryPhoto } from './categoryAssets.js'

export default function CategoryPhoto({ category, imageUrl, className = '', placeholderOnly = false }) {
  const [failedImage, setFailedImage] = useState('')
  const fallbackImage = placeholderOnly ? '' : getCategoryPhoto(category)
  const image = imageUrl && failedImage !== imageUrl ? imageUrl : placeholderOnly ? '' : fallbackImage

  return !image
    ? <span className={`flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[var(--brand-primary-soft)] px-2 text-center text-[10px] font-semibold capitalize text-[var(--text-secondary)] ${className}`}><ImageOff size={20} strokeWidth={1.7} aria-hidden="true" /><span className="line-clamp-2">{category.replace(/[-_]/g, ' ')}</span></span>
    : <img src={image} alt="" loading="lazy" className={className} onError={() => setFailedImage(image)} />
}
