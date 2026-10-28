import { useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  useAddAddressMutation,
  useCreateCheckoutPaymentMutation,
  useGetCartQuery,
  useGetPickupSlotsQuery,
  useGetProfileQuery,
  useMarkCheckoutPaymentFailedMutation,
  useVerifyPaymentMutation,
} from '../../api/api.js'
import { createUuid, formatPrice, getErrorMessage, loadRazorpaySdk } from '../utils.js'

export function useCheckoutFlow({ onToast }) {
  const navigate = useNavigate()
  const token = useSelector((state) => state.auth.token)
  const selectedStore = useSelector((state) => state.selectedStore)

  const { data: profileResponse, isLoading: profileLoading, error: profileError } = useGetProfileQuery(undefined, { skip: !token })
  const { data: cartResponse, isLoading: cartLoading, error: cartError } = useGetCartQuery(undefined, { skip: !token })
  const [createCheckoutPayment, checkoutPaymentState] = useCreateCheckoutPaymentMutation()
  const [markPaymentFailed] = useMarkCheckoutPaymentFailedMutation()
  const [verifyPayment] = useVerifyPaymentMutation()
  const [addAddress, addressState] = useAddAddressMutation()

  const [addressId, setAddressId] = useState('')
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [newAddress, setNewAddress] = useState({ label: 'Home', fullAddress: '', landmark: '', pincode: '' })
  const [addressError, setAddressError] = useState('')
  const [orderType, setOrderType] = useState('delivery')
  const [pickupDate, setPickupDate] = useState(getIndiaDateString)
  const [pickupAt, setPickupAt] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('upi')
  const [error, setError] = useState('')
  const [paymentBusy, setPaymentBusy] = useState(false)
  const paymentFailureNotified = useRef(false)

  const addresses = profileResponse?.data?.addresses || []
  const firstAddressId = addresses[0]?._id
  const selectedAddressId = addressId || firstAddressId || ''
  const mustAddAddress = orderType === 'delivery' && !profileLoading && !profileError && addresses.length === 0

  const { data: pickupSlotsResponse, isLoading: pickupSlotsLoading, error: pickupSlotsError } = useGetPickupSlotsQuery(
    { storeId: selectedStore?._id, date: pickupDate },
    { skip: orderType !== 'pickup' || !selectedStore?._id },
  )

  const pickupSlots = pickupSlotsResponse?.data?.slots || []
  const selectedPickupSlotAvailable = pickupSlots.some((slot) => slot.startAt === pickupAt)

  const cart = cartResponse?.data
  const items = cart?.items || []
  const hasUnavailableItems = cart?.hasUnavailableItems || items.some((item) => !item.available)
  const loading = profileLoading || cartLoading

  async function saveCheckoutAddress(event) {
    event.preventDefault()
    setAddressError('')
    try {
      const response = await addAddress({
        ...newAddress,
        label: newAddress.label.trim(),
        fullAddress: newAddress.fullAddress.trim(),
        landmark: newAddress.landmark.trim(),
      }).unwrap()
      setAddressId(response.data._id)
      setNewAddress({ label: 'Home', fullAddress: '', landmark: '', pincode: '' })
      setAddressModalOpen(false)
    } catch (requestError) {
      setAddressError(getErrorMessage(requestError))
    }
  }

  async function handleFailedPayment(razorpayOrderId, title, message) {
    if (paymentFailureNotified.current) return
    paymentFailureNotified.current = true
    setPaymentBusy(false)
    setError(`${message} No order was placed.`)
    onToast({ type: 'error', title, message: `${message} No order was placed.` })
    try {
      await markPaymentFailed(razorpayOrderId).unwrap()
    } catch (requestError) {
      const statusMessage = `The payment failed and no order was placed, but its checkout status could not be updated: ${getErrorMessage(requestError)}`
      setError(statusMessage)
      onToast({ type: 'error', title: 'Payment status update failed', message: statusMessage })
    }
  }

  async function payForCheckout(payment) {
    setError('')
    paymentFailureNotified.current = false
    try {
      const loaded = await loadRazorpaySdk()
      if (!loaded || !window.Razorpay) {
        await handleFailedPayment(payment.razorpayOrderId, 'Unable to open payment', 'Razorpay Checkout could not be loaded. Please check your connection and try again.')
        return
      }

      const checkout = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: 'NalliBokka',
        description: 'NalliBokka order',
        order_id: payment.razorpayOrderId,
        ...(payment.callbackUrl ? { callback_url: payment.callbackUrl, redirect: true } : {}),
        prefill: { name: profileResponse?.data?.name, email: profileResponse?.data?.email, contact: profileResponse?.data?.phone },
        theme: { color: 'var(--brand-primary)' },
        handler: async (response) => {
          paymentFailureNotified.current = true
          try {
            const result = await verifyPayment({
              razorpayOrderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }).unwrap()
            setPaymentBusy(false)
            onToast({ type: 'success', title: 'Order placed', message: 'Payment was successful. Your order is confirmed.' })
            navigate(`/orders?order=${result.data.orderId}`)
          } catch (verifyError) {
            paymentFailureNotified.current = true
            setPaymentBusy(false)
            const message = `Payment verification failed: ${getErrorMessage(verifyError)} Your payment may still be processing. Check your payment status before retrying.`
            setError(message)
            onToast({ type: 'error', title: 'Payment needs attention', message: getErrorMessage(verifyError) })
          }
        },
        modal: {
          ondismiss: () => {
            handleFailedPayment(payment.razorpayOrderId, 'Payment not completed', 'The payment window closed before payment was confirmed.')
          },
        },
      })

      checkout.on('payment.failed', (response) => {
        const message = response.error?.description || 'The payment could not be completed. Please try again.'
        handleFailedPayment(payment.razorpayOrderId, 'Payment failed', message)
      })

      checkout.open()
    } catch (requestError) {
      const message = getErrorMessage(requestError)
      await handleFailedPayment(payment.razorpayOrderId, 'Unable to start payment', message)
    }
  }

  async function submitOrder() {
    setError('')
    setPaymentBusy(true)
    try {
      const response = await createCheckoutPayment({
        ...(orderType === 'delivery' ? { addressId: selectedAddressId } : { pickupAt }),
        storeId: selectedStore?._id,
        orderType,
        idempotencyKey: createUuid(),
      }).unwrap()
      await payForCheckout(response.data)
    } catch (requestError) {
      const message = getErrorMessage(requestError)
      setError(message)
      onToast({ type: 'error', title: 'Unable to start checkout', message })
      setPaymentBusy(false)
    }
  }

  return {
    token,
    selectedStore,
    profileResponse,
    profileLoading,
    profileError,
    cartResponse,
    cartLoading,
    cartError,
    createCheckoutPayment,
    checkoutPaymentState,
    addressId,
    setAddressId,
    addressModalOpen,
    setAddressModalOpen,
    newAddress,
    setNewAddress,
    addressError,
    setAddressError,
    orderType,
    setOrderType,
    pickupDate,
    setPickupDate,
    pickupAt,
    setPickupAt,
    paymentMethod,
    setPaymentMethod,
    error,
    setError,
    paymentBusy,
    setPaymentBusy,
    addresses,
    selectedAddressId,
    mustAddAddress,
    pickupSlotsResponse,
    pickupSlotsLoading,
    pickupSlotsError,
    pickupSlots,
    selectedPickupSlotAvailable,
    cart,
    items,
    hasUnavailableItems,
    loading,
    saveCheckoutAddress,
    submitOrder,
    formatPrice,
    getIndiaDateString,
    formatPickupTime,
    addressState,
  }
}

function getIndiaDateString() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function formatPickupTime(value) {
  return new Date(value).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  })
}
