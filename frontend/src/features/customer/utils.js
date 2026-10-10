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
