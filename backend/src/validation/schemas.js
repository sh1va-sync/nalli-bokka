import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');
const address = z.object({
  label: z.string().trim().min(1).max(40),
  fullAddress: z.string().trim().min(5).max(500),
  landmark: z.string().trim().max(200).optional().default(''),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits')
}).strict();
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
};
function dateRangeQuery(shape) {
  return z.object({
    ...shape,
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional()
  }).strict()
    .refine(query => Boolean(query.from) === Boolean(query.to), 'Both from and to are required together')
    .refine(query => !query.from || Date.parse(query.from) < Date.parse(query.to), 'from must be earlier than to');
}
const selection = z.object({
  selectionType: z.enum(['weight', 'pieces', 'pack']),
  selectedQuantity: z.number().positive(),
  selectedPackLabel: z.string().trim().min(1).max(40).optional()
}).strict().refine(value => (
  value.selectionType === 'pack' ? Boolean(value.selectedPackLabel) : value.selectedPackLabel === undefined
), 'A pack label is required only for pack selections');

const schemas = {
  verifyOtp: {
    body: z.object({
      firebaseIdToken: z.string().min(1).max(8192)
    }).strict()
  },
  completeUserRegistration: {
    body: z.object({
      verificationToken: z.string().min(1),
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().email().max(254).optional()
    }).strict()
  },
  storeLogin: {
    body: z.object({
      username: z.string().trim().min(1).max(100),
      password: z.string().min(1).max(200)
    }).strict()
  },
  profileUpdate: {
    body: z.object({
      name: z.string().trim().min(1).max(100).optional(),
      email: z.string().trim().email().max(254).optional().or(z.literal(''))
    }).strict().refine(value => Object.keys(value).length > 0, 'At least one profile field is required')
  },
  address: { body: address },
  addressUpdate: {
    params: z.object({ addressId: objectId }),
    body: address.partial().strict().refine(value => Object.keys(value).length > 0, 'At least one address field is required')
  },
  addressParams: { params: z.object({ addressId: objectId }) },
  notificationList: {
    query: z.object(pagination).strict()
  },
  notificationParams: {
    params: z.object({ notificationId: objectId })
  },
  productList: {
    query: z.object({
      ...pagination,
      storeId: objectId.optional(),
      productType: z.string().trim().min(1).max(40).optional(),
      search: z.string().trim().max(100).optional()
    }).strict()
  },
  storeList: {
    query: z.object({
      ...pagination,
      search: z.string().trim().max(100).optional()
    }).strict()
  },
  storeProductList: {
    query: z.object({
      ...pagination,
      productType: z.string().trim().min(1).max(40).optional(),
      search: z.string().trim().max(100).optional(),
      inStock: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
      pricingMode: z.enum(['weight', 'pack']).optional()
    }).strict()
  },
  storeProductCategoryCreate: {
    body: z.object({
      name: z.string().trim().min(1).max(40)
    }).strict()
  },
  storeProductCategoryList: {
    query: z.object({}).strict()
  },
  storeProductCategoryDelete: {
    params: z.object({ categoryName: z.string().trim().min(1).max(40) }).strict()
  },
  idParams: { params: z.object({ id: objectId }) },
  productCreate: {
    body: z.object({
      productType: z.string().trim().min(1).max(40),
      pricingMode: z.enum(['weight', 'pack']),
      productName: z.string().trim().min(1).max(120),
      inStock: z.boolean().optional(),
      pricePerKg: z.number().min(0).optional(),
      pieceWeightGrams: z.number().positive().optional(),
      packs: z.array(z.object({
        label: z.string().trim().min(1).max(40),
        price: z.number().min(0)
      }).strict()).max(50).optional()
    }).strict()
  },
  productUpdate: {
    params: z.object({ productId: objectId }),
    body: z.object({
      productType: z.string().trim().min(1).max(40).optional(),
      pricingMode: z.enum(['weight', 'pack']).optional(),
      productName: z.string().trim().min(1).max(120).optional(),
      inStock: z.boolean().optional(),
      pricePerKg: z.number().min(0).nullable().optional(),
      pieceWeightGrams: z.number().positive().nullable().optional(),
      packs: z.array(z.object({
        label: z.string().trim().min(1).max(40),
        price: z.number().min(0)
      }).strict()).max(50).optional()
    }).strict().refine(value => Object.keys(value).length > 0, 'At least one product field is required')
  },
  productParams: { params: z.object({ productId: objectId }) },
  stockUpdate: {
    params: z.object({ productId: objectId }),
    body: z.object({ inStock: z.boolean() }).strict()
  },
  cartItemCreate: {
    body: selection.extend({ productId: objectId })
  },
  cartItemUpdate: {
    params: z.object({ itemId: objectId }),
    body: selection
  },
  cartItemParams: { params: z.object({ itemId: objectId }) },
  orderList: {
    query: dateRangeQuery({
      ...pagination,
      orderStatus: z.enum(['placed', 'packing', 'out for delivery', 'ready for pickup', 'delivered', 'picked up', 'cancelled']).optional(),
      orderType: z.enum(['delivery', 'pickup']).optional(),
      search: z.string().trim().min(1).max(100).optional(),
      sort: z.enum(['newest', 'oldest', 'amount_desc', 'amount_asc']).default('newest')
    })
  },
  orderParams: { params: z.object({ orderId: objectId }) },
  orderStatusUpdate: {
    params: z.object({ orderId: objectId }),
    body: z.object({
      orderStatus: z.enum(['packing', 'out for delivery', 'ready for pickup', 'delivered', 'picked up', 'cancelled'])
    }).strict()
  },
  storeOrderRefund: {
    params: z.object({ orderId: objectId }),
    body: z.object({}).strict().optional()
  },
  paymentCreate: { params: z.object({ orderId: objectId }) },
  checkoutAttemptParams: {
    params: z.object({
      razorpayOrderId: z.string().min(1).max(100)
    })
  },
  checkoutPaymentCreate: {
    body: z.object({
      addressId: objectId.optional(),
      storeId: objectId.optional(),
      orderType: z.enum(['delivery', 'pickup']).default('delivery'),
      pickupAt: z.string().datetime({ offset: true }).optional(),
      idempotencyKey: z.string().uuid()
    }).strict().refine(({ orderType, addressId, pickupAt }) => (
      orderType === 'delivery' ? Boolean(addressId) && !pickupAt : Boolean(pickupAt)
    ), {
      message: 'Delivery requires an address; pickup requires a selected pickup slot',
      path: ['orderType']
    })
  },
  paymentVerify: {
    body: z.object({
      razorpayOrderId: z.string().min(1).max(100),
      paymentId: z.string().min(1).max(100),
      signature: z.string().regex(/^[a-f\d]{64}$/i)
    }).strict()
  },
  storeStatusUpdate: {
    body: z.object({
      isOpen: z.boolean()
    }).strict()
  },
  storeHoursUpdate: {
    body: z.object({
      openingTime: z.string().regex(/^(?:[01]\d|2[0-3]):[03]0$/, 'Opening time must use 30-minute increments'),
      closingTime: z.string().regex(/^(?:[01]\d|2[0-3]):[03]0$/, 'Closing time must use 30-minute increments')
    }).strict().refine(({ openingTime, closingTime }) => openingTime < closingTime, {
      message: 'Closing time must be later than opening time',
      path: ['closingTime']
    })
  },
  storePickupSlots: {
    params: z.object({ id: objectId }),
    query: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    }).strict()
  },
  dashboard: {
    query: dateRangeQuery({
      days: z.coerce.number().int().min(1).max(90).default(7)
    })
  },
  transactionList: {
    query: dateRangeQuery({
      ...pagination,
      status: z.enum(['created', 'paid', 'failed']).optional()
    })
  },
  storeReportExport: {
    query: dateRangeQuery({
      type: z.enum(['orders', 'transactions'])
    }).refine(query => Boolean(query.from), 'Both from and to are required')
  },
  storeAuditEventList: {
    query: z.object(pagination).strict()
  },
  transactionParams: {
    params: z.object({ transactionId: objectId })
  }
};

export { objectId, schemas };
