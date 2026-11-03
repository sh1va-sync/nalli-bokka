const phonePattern = /^\+?[\d() .-]{6,29}$/;
const storeTimePattern = /^(?:[01]\d|2[0-3]):[03]0$/;

function requiredText(value, field) {
  const text = value.trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function optionalPhone(value, field) {
  const phone = value.trim();
  if (phone && !phonePattern.test(phone)) {
    throw new Error(`${field} must be a valid phone number of at most 30 characters`);
  }
  return phone;
}

function parseStoreOpen(value) {
  const normalized = value.trim().toLowerCase();
  if (['true', 'yes', 'y', 'open'].includes(normalized)) return true;
  if (['false', 'no', 'n', 'closed'].includes(normalized)) return false;
  throw new Error('Store open status must be yes or no');
}

function parseMinimumOrderValue(value) {
  const minimumOrderValue = Number(value.trim());
  if (!Number.isFinite(minimumOrderValue) || minimumOrderValue < 0 || minimumOrderValue > 1000000) {
    throw new Error('Minimum order value must be a number between 0 and 1000000');
  }
  return minimumOrderValue;
}

export function prepareStoreInput(input) {
  const storeName = requiredText(input.storeName, 'Store name');
  const username = requiredText(input.username, 'Store username').toLowerCase();
  const password = input.password;
  const location = requiredText(input.location, 'Store location');
  const storePhone = optionalPhone(input.storePhone, 'Store phone');
  const storeNumber = optionalPhone(input.storeNumber, 'Store number');
  const googleMapsLink = input.googleMapsLink.trim();
  const googleMapLink = input.googleMapLink.trim();
  const mapLink = input.mapLink.trim();
  const isOpen = parseStoreOpen(input.isOpen);
  const minimumOrderValue = parseMinimumOrderValue(input.minimumOrderValue);
  const openingTime = input.openingTime.trim();
  const closingTime = input.closingTime.trim();

  if (username.length > 100) throw new Error('Store username must be at most 100 characters');
  if (password.length < 8 || password.length > 200) {
    throw new Error('Store password must be between 8 and 200 characters');
  }
  for (const [field, value] of [['Opening time', openingTime], ['Closing time', closingTime]]) {
    if (!storeTimePattern.test(value)) {
      throw new Error(`${field} must use HH:00 or HH:30 in 24-hour time`);
    }
  }
  if (closingTime <= openingTime) throw new Error('Closing time must be later than opening time');

  return {
    storeName,
    username,
    password,
    location,
    storePhone,
    storeNumber,
    googleMapsLink,
    googleMapLink,
    mapLink,
    isOpen,
    minimumOrderValue,
    openingTime,
    closingTime,
  };
}
