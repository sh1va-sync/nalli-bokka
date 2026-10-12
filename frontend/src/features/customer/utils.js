export function createUuid() {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function getErrorMessage(error) {
  if (typeof error === 'string') return error
  return error?.data?.error || error?.data?.message || error?.message || error?.error || 'Something went wrong. Please try again.'
}

export function getProductStoreId(product) {
  return typeof product?.storeId === 'string'
    ? product.storeId
    : product?.storeId?._id || product?.storeId?.id
}

export function formatPrice(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(value || 0))
}

export function formatSelection(item) {
  if (item.selectionType === 'weight') {
    const quantity = Number(item.selectedQuantity)
    if (quantity < 1) {
      return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(quantity * 1000)} grams`
    }
    return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(quantity)} kg`
  }
  if (item.selectionType === 'pieces') return `${item.selectedQuantity} pc`
  return `${item.selectedQuantity} × ${item.selectedPackLabel}`
}

export function loadRazorpaySdk() {
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}
