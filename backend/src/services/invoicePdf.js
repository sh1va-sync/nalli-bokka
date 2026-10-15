import PDFDocument from 'pdfkit';

const colors = {
  ink: '#292724',
  muted: '#77736b',
  border: '#e8e5de',
  soft: '#f5f4f0',
  brand: '#861923',
  green: '#426b4b'
};

function printable(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatAmount(value) {
  return `INR ${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0)}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });
}

function invoiceNumber(order) {
  return `NB-${String(order._id).toUpperCase()}`;
}

export function createInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 48, right: 48, bottom: 54, left: 48 },
      info: {
        Title: `Invoice ${invoiceNumber(order)}`,
        Author: printable(order.storeId?.storeName || 'NalliBokka'),
        Subject: `Order invoice ${invoiceNumber(order)}`
      }
    });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    const left = document.page.margins.left;
    const right = document.page.width - document.page.margins.right;
    const contentWidth = right - left;
    const amountX = right - 115;
    const quantityX = right - 215;

    function drawTableHeader() {
      const y = document.y;
      document.rect(left, y, contentWidth, 25).fill(colors.soft);
      document.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8)
        .text('ITEM', left + 9, y + 8, { width: quantityX - left - 20 })
        .text('QTY', quantityX, y + 8, { width: 90, align: 'right' })
        .text('AMOUNT', amountX, y + 8, { width: 105, align: 'right' });
      document.y = y + 25;
    }

    document.rect(0, 0, document.page.width, 9).fill(colors.brand);
    document.fillColor(colors.brand).font('Helvetica-Bold').fontSize(20)
      .text(printable(order.storeId?.storeName || 'NalliBokka'), left, 43, { width: 270 });
    document.fillColor(colors.muted).font('Helvetica').fontSize(9)
      .text(printable(order.storeId?.location), left, 70, { width: 270 });
    document.fillColor(colors.ink).font('Helvetica-Bold').fontSize(20)
      .text('ORDER INVOICE', right - 190, 47, { width: 190, align: 'right' });
    document.fillColor(colors.muted).font('Helvetica').fontSize(9)
      .text(`Invoice no. ${invoiceNumber(order)}`, right - 200, 73, { width: 200, align: 'right' })
      .text(`Issued ${formatDate(order.invoiceGeneratedAt || order.createdAt)}`, right - 200, 88, { width: 200, align: 'right' });

    document.moveTo(left, 116).lineTo(right, 116).lineWidth(1).strokeColor(colors.border).stroke();
    const billTop = 133;
    const isPickup = order.orderType === 'pickup';
    document.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8)
      .text('BILLED TO', left, billTop)
      .text(isPickup ? 'STORE PICKUP' : 'DELIVERY ADDRESS', left + contentWidth / 2, billTop);

    const customer = order.userId || {};
    const address = order.deliveryAddress || {};
    document.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10)
      .text(printable(customer.name || 'Customer'), left, billTop + 15, { width: contentWidth / 2 - 15 });
    document.fillColor(colors.muted).font('Helvetica').fontSize(9)
      .text(printable(customer.phone), left, billTop + 31, { width: contentWidth / 2 - 15 });
    if (isPickup) {
      document.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10)
        .text(printable(order.storeId?.storeName || 'Store pickup'), left + contentWidth / 2, billTop + 15, { width: contentWidth / 2 });
      document.fillColor(colors.muted).font('Helvetica').fontSize(9)
        .text(`Pickup time: ${formatDate(order.pickupAt)}`, left + contentWidth / 2, billTop + 31, { width: contentWidth / 2, height: 45 });
    } else {
      document.fillColor(colors.muted).font('Helvetica').fontSize(9)
        .text(printable(address.label), left + contentWidth / 2, billTop + 15, { width: contentWidth / 2 });
      document.fillColor(colors.ink).font('Helvetica').fontSize(9)
        .text(printable(`${address.fullAddress || ''} ${address.landmark || ''} ${address.pincode || ''}`), left + contentWidth / 2, billTop + 31, {
          width: contentWidth / 2,
          height: 45,
          lineGap: 2
        });
    }

    document.y = 205;
    document.fillColor(colors.ink).font('Helvetica-Bold').fontSize(11).text('Order summary', left);
    document.moveDown(0.8);
    drawTableHeader();

    for (const item of order.items || []) {
      const itemName = printable(item.productName || 'Item');
      const quantity = `${item.quantity} ${item.selectionType === 'weight'
        ? 'kg'
        : item.selectionType === 'pieces'
          ? (item.quantity === 1 ? 'piece' : 'pieces')
          : `x ${printable(item.packLabel)}`}`;
      const rowHeight = Math.max(
        document.heightOfString(itemName, { width: quantityX - left - 35, font: 'Helvetica', fontSize: 9 }) + 18,
        34
      );

      if (document.y + rowHeight > document.page.height - 160) {
        document.addPage();
        drawTableHeader();
      }

      const rowY = document.y;
      document.fillColor(colors.ink).font('Helvetica').fontSize(9)
        .text(itemName, left + 9, rowY + 10, { width: quantityX - left - 30 });
      document.fillColor(colors.muted)
        .text(printable(quantity), quantityX, rowY + 10, { width: 90, align: 'right' });
      document.fillColor(colors.ink).font('Helvetica-Bold')
        .text(formatAmount(item.price), amountX, rowY + 10, { width: 105, align: 'right' });
      document.moveTo(left, rowY + rowHeight).lineTo(right, rowY + rowHeight).lineWidth(0.5).strokeColor(colors.border).stroke();
      document.y = rowY + rowHeight;
    }

    if (document.y + 105 > document.page.height - document.page.margins.bottom) {
      document.addPage();
    }
    document.moveDown(1.2);
    const totalTop = document.y;
    document.fillColor(colors.muted).font('Helvetica').fontSize(9)
      .text(`Payment status: ${printable(order.paymentStatus).replaceAll('_', ' ')}`, left, totalTop, { width: 250 });
    document.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10)
      .text('Order total', amountX - 20, totalTop, { width: 105, align: 'right' });
    document.fillColor(colors.green).font('Helvetica-Bold').fontSize(14)
      .text(formatAmount(order.totalAmount), amountX, totalTop + 18, { width: 105, align: 'right' });
    document.fillColor(colors.muted).font('Helvetica').fontSize(8)
      .text('This order invoice reflects saved item and price details; tax is not separately itemized.', left, totalTop + 45, { width: contentWidth });

    document.end();
  });
}
