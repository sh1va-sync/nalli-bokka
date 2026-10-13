import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ID');
const imageUrl = z.string().url().max(2048).refine(value => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'Image URL must use HTTP or HTTPS');
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
      productType: z.enum(['meat', 'vegetable', 'fruit', 'oil', 'rice']).optional(),
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
      productType: z.enum(['meat', 'vegetable', 'fruit', 'oil', 'rice']).optional(),
      search: z.string().trim().max(100).optional()
    }).strict()
  },
  idParams: { params: z.object({ id: objectId }) },
  productCreate: {
    body: z.object({
      productType: z.enum(['meat', 'vegetable', 'fruit', 'oil', 'rice']),
      productName: z.string().trim().min(1).max(120),
      imageUrl,
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
      productType: z.enum(['meat', 'vegetable', 'fruit', 'oil', 'rice']).optional(),
      productName: z.string().trim().min(1).max(120).optional(),
      imageUrl: imageUrl.optional(),
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
      orderStatus: z.enum(['placed', 'packing', 'out for delivery', 'delivered', 'cancelled']).optional(),
      search: z.string().trim().min(1).max(100).optional(),
      sort: z.enum(['newest', 'oldest', 'amount_desc', 'amount_asc']).default('newest')
    })
  },
  orderParams: { params: z.object({ orderId: objectId }) },
  orderStatusUpdate: {
    params: z.object({ orderId: objectId }),
    body: z.object({
      orderStatus: z.enum(['packing', 'out for delivery', 'delivered', 'cancelled'])
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
      addressId: objectId,
      storeId: objectId.optional(),
      idempotencyKey: z.string().uuid()
    }).strict()
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
