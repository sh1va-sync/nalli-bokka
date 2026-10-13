import jwt from 'jsonwebtoken';
import Store from '../models/Store.js';
import User from '../models/User.js';
import firebaseAuth from '../services/firebaseAuth.js';
import AppError from '../utils/AppError.js';

const invalidFirebaseTokenCodes = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/invalid-claims',
  'auth/tenant-id-mismatch',
  'auth/user-disabled'
]);

function createToken(subject, role) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new AppError(503, 'Authentication is not configured with a secure JWT_SECRET');
  }

  return jwt.sign({ role }, process.env.JWT_SECRET, {
    subject: String(subject),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    issuer: 'nalli-bokka-api'
  });
}

function createRegistrationToken(phone) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new AppError(503, 'Authentication is not configured with a secure JWT_SECRET');
  }

  return jwt.sign({ purpose: 'user-registration' }, process.env.JWT_SECRET, {
    subject: phone,
    expiresIn: '10m',
    issuer: 'nalli-bokka-api'
  });
}

export async function verifyUserOtp(req, res) {
  let decodedToken;
  try {
    decodedToken = await firebaseAuth.verifyIdToken(req.body.firebaseIdToken);
  } catch (error) {
    if (invalidFirebaseTokenCodes.has(error.code)) {
      throw new AppError(401, 'Firebase phone verification is invalid or expired');
    }
    throw error;
  }

  const phone = decodedToken.phone_number;
  if (!phone || decodedToken.firebase?.sign_in_provider !== 'phone') {
    throw new AppError(401, 'A verified Firebase phone sign-in is required');
  }

  const user = await User.findOne({ phone });
  if (!user) {
    return res.json({
      isNewUser: true,
      verificationToken: createRegistrationToken(phone)
    });
  }

  res.json({
    isNewUser: false,
    token: createToken(user._id, 'user'),
    user
  });
}

export async function completeUserRegistration(req, res) {
  const { verificationToken, name, email } = req.body;
  let claims;
  try {
    claims = jwt.verify(verificationToken, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'nalli-bokka-api'
    });
  } catch {
    throw new AppError(401, 'Invalid or expired registration token');
  }

  if (
    typeof claims !== 'object' ||
    claims.purpose !== 'user-registration' ||
    typeof claims.sub !== 'string'
  ) {
    throw new AppError(401, 'Invalid or expired registration token');
  }

  const existingUser = await User.findOne({ phone: claims.sub });
  if (existingUser) {
    throw new AppError(409, 'An account already exists for this phone number');
  }

  const user = await User.create({
    phone: claims.sub,
    name,
    ...(email ? { email } : {})
  });

  res.status(201).json({
    isNewUser: true,
    token: createToken(user._id, 'user'),
    user
  });
}

export async function loginStore(req, res) {
  const store = await Store.findOne({ username: req.body.username.toLowerCase() }).select('+password');
  if (!store || !(await store.comparePassword(req.body.password))) {
    throw new AppError(401, 'Invalid username or password');
  }

  res.json({
    token: createToken(store._id, 'store'),
    store: {
      id: store._id,
      storeName: store.storeName,
      username: store.username,
      location: store.location,
      isOpen: store.isOpen,
      storePhone: store.storePhone || store.storeNumber,
      googleMapsLink: store.googleMapsLink || store.googleMapLink || store.mapLink
    }
  });
}

export async function getCurrentAccount(req, res) {
  const model = req.auth.role === 'store' ? Store : User;
  const account = await model.findById(req.auth.id);
  if (!account) {
    throw new AppError(401, 'Account no longer exists');
  }

  res.json({ account, role: req.auth.role });
}
