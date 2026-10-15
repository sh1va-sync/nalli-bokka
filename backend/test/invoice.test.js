import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInvoicePdf } from '../src/services/invoicePdf.js';

const invoiceOrder = {
  _id: '507f1f77bcf86cd799439011',
  createdAt: new Date('2026-10-15T10:00:00.000Z'),
  orderStatus: 'delivered',
  paymentStatus: 'paid',
  totalAmount: 490,
  userId: { name: 'Shiva', phone: '+919999999999' },
  storeId: { storeName: 'Gajwel Store', location: 'Gajwel' },
  deliveryAddress: {
    label: 'Home',
    fullAddress: '12 Market Road',
    landmark: 'Near bus stand',
    pincode: '500001'
  },
  items: [
    { productName: 'Sunflower Oil', selectionType: 'pack', quantity: 1, packLabel: '1 L', price: 180 },
    { productName: 'Apples', selectionType: 'weight', quantity: 1, price: 250 },
    { productName: 'Mutton', selectionType: 'pieces', quantity: 2, price: 60 }
  ]
};

test('invoice PDF contains a valid PDF document with invoice metadata', async () => {
  const pdf = await createInvoicePdf(invoiceOrder);

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.3');
  assert.ok(pdf.subarray(-20).toString().includes('%%EOF'));
  assert.ok(pdf.length > 1_000);
});
