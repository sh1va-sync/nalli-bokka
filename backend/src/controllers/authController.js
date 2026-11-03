// import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
// import jwt from 'jsonwebtoken';
// import OtpChallenge from '../models/OtpChallenge.js';
// import Store from '../models/Store.js';
// import User from '../models/User.js';
// import renflairSms from '../services/renflairSms.js';
// import AppError from '../utils/AppError.js';

// const otpLifetimeMs = 5 * 60 * 1000;
// const maxOtpAttempts = 5;

// function hashOtp(phone, code) {
//   if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
//     throw new AppError(503, 'Authentication is not configured with a secure JWT_SECRET');
//   }
//   return createHmac('sha256', process.env.JWT_SECRET)
//     .update(`${phone}:${code}`)
//     .digest('hex');
// }

// function matchesOtp(phone, code, codeHash) {
//   if (!/^[\da-f]{64}$/i.test(codeHash)) {
//     return false;
//   }
//   const candidateHash = hashOtp(phone, code);
//   return timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(codeHash, 'hex'));
// }

// function createToken(subject, role) {
//   if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
//     throw new AppError(503, 'Authentication is not configured with a secure JWT_SECRET');
//   }

//   return jwt.sign({ role }, process.env.JWT_SECRET, {
//     subject: String(subject),
//     expiresIn: process.env.JWT_EXPIRES_IN || '7d',
//     issuer: 'nalli-bokka-api'
//   });
// }

// function createRegistrationToken(phone) {
//   if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
//     throw new AppError(503, 'Authentication is not configured with a secure JWT_SECRET');
//   }

//   return jwt.sign({ purpose: 'user-registration' }, process.env.JWT_SECRET, {
//     subject: phone,
//     expiresIn: '10m',
//     issuer: 'nalli-bokka-api'
//   });
// }

// export async function sendUserOtp(req, res) {
//   const { phone } = req.body;
//   const code = String(randomInt(100000, 1000000));
//   const codeHash = hashOtp(phone, code);
//   await renflairSms.sendOtp(phone, code);
//   await OtpChallenge.findOneAndUpdate(
//     { phone },
//     {
//       $set: {
//         codeHash,
//         expiresAt: new Date(Date.now() + otpLifetimeMs),
//         attemptsUsed: 0
//       }
//     },
//     { upsert: true, new: true, setDefaultsOnInsert: true }
//   );
//   res.json({ message: 'Verification code sent' });
// }

// export async function verifyUserOtp(req, res) {
//   const { phone, code } = req.body;
//   const challenge = await OtpChallenge.findOne({
//     phone,
//     expiresAt: { $gt: new Date() },
//     attemptsUsed: { $lt: maxOtpAttempts }
//   });
//   if (!challenge) {
//     throw new AppError(401, 'Invalid or expired verification code');
//   }

//   if (!matchesOtp(phone, code, challenge.codeHash)) {
//     await OtpChallenge.updateOne(
//       {
//         _id: challenge._id,
//         codeHash: challenge.codeHash,
//         attemptsUsed: { $lt: maxOtpAttempts }
//       },
//       { $inc: { attemptsUsed: 1 } }
//     );
//     throw new AppError(401, 'Invalid or expired verification code');
//   }

//   const consumedChallenge = await OtpChallenge.findOneAndDelete({
//     _id: challenge._id,
//     codeHash: challenge.codeHash,
//     attemptsUsed: challenge.attemptsUsed,
//     expiresAt: { $gt: new Date() }
//   });
//   if (!consumedChallenge) {
//     throw new AppError(401, 'Invalid or expired verification code');
//   }

//   const user = await User.findOne({ phone });
//   if (!user) {
//     return res.json({
//       isNewUser: true,
//       verificationToken: createRegistrationToken(phone)
//     });
//   }

//   res.json({
//     isNewUser: false,
//     token: createToken(user._id, 'user'),
//     user
//   });
// }

// export async function completeUserRegistration(req, res) {
//   const { verificationToken, name, email } = req.body;
//   let claims;
//   try {
//     claims = jwt.verify(verificationToken, process.env.JWT_SECRET, {
//       algorithms: ['HS256'],
//       issuer: 'nalli-bokka-api'
//     });
//   } catch {
//     throw new AppError(401, 'Invalid or expired registration token');
//   }

//   if (
//     typeof claims !== 'object' ||
//     claims.purpose !== 'user-registration' ||
//     typeof claims.sub !== 'string'
//   ) {
//     throw new AppError(401, 'Invalid or expired registration token');
//   }

//   const existingUser = await User.findOne({ phone: claims.sub });
//   if (existingUser) {
//     throw new AppError(409, 'An account already exists for this phone number');
//   }

//   const user = await User.create({
//     phone: claims.sub,
//     name,
//     ...(email ? { email } : {})
//   });

//   res.status(201).json({
//     isNewUser: true,
//     token: createToken(user._id, 'user'),
//     user
//   });
// }

// export async function loginStore(req, res) {
//   const store = await Store.findOne({ username: req.body.username.toLowerCase() }).select('+password');
//   if (!store || !(await store.comparePassword(req.body.password))) {
//     throw new AppError(401, 'Invalid username or password');
//   }

//   res.json({
//     token: createToken(store._id, 'store'),
//     store: {
//       id: store._id,
//       storeName: store.storeName,
//       username: store.username,
//       location: store.location,
//       isOpen: store.isOpen,
//       minimumOrderValue: store.minimumOrderValue,
//       openingTime: store.openingTime,
//       closingTime: store.closingTime,
//       storePhone: store.storePhone || store.storeNumber,
//       googleMapsLink: store.googleMapsLink || store.googleMapLink || store.mapLink
//     }
//   });
// }

// export async function getCurrentAccount(req, res) {
//   const model = req.auth.role === 'store' ? Store : User;
//   const account = await model.findById(req.auth.id);
//   if (!account) {
//     throw new AppError(401, 'Account no longer exists');
//   }

//   res.json({ account, role: req.auth.role });
// }


import {
  createHmac,
  randomInt,
  timingSafeEqual
} from 'node:crypto';

import jwt from 'jsonwebtoken';

import OtpChallenge from '../models/OtpChallenge.js';
import Store from '../models/Store.js';
import User from '../models/User.js';

import renflairSms from '../services/renflairSms.js';
import AppError from '../utils/AppError.js';

const otpLifetimeMs = 5 * 60 * 1000;
const maxOtpAttempts = 5;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new AppError(
      503,
      'Authentication is not configured with a secure JWT_SECRET'
    );
  }

  return secret;
}

// Hash OTP using HMAC-SHA256
function hashOtp(phone, code) {
  return createHmac('sha256', getJwtSecret())
    .update(`${phone}:${code}`)
    .digest('hex');
}

// Constant-time OTP comparison
function matchesOtp(phone, code, codeHash) {
  if (
    typeof codeHash !== 'string' ||
    !/^[\da-f]{64}$/i.test(codeHash)
  ) {
    return false;
  }

  const candidateHash = hashOtp(phone, code);

  return timingSafeEqual(
    Buffer.from(candidateHash, 'hex'),
    Buffer.from(codeHash, 'hex')
  );
}

// Create authentication JWT
function createToken(subject, role) {
  return jwt.sign(
    { role },
    getJwtSecret(),
    {
      subject: String(subject),
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'nalli-bokka-api'
    }
  );
}

// Create temporary registration JWT
function createRegistrationToken(phone) {
  return jwt.sign(
    { purpose: 'user-registration' },
    getJwtSecret(),
    {
      subject: phone,
      expiresIn: '10m',
      issuer: 'nalli-bokka-api'
    }
  );
}

// Send customer OTP
export async function sendUserOtp(req, res) {
  const { phone } = req.body;

  const code = String(randomInt(100000, 1000000));
  const codeHash = hashOtp(phone, code);

  // Save OTP challenge before sending SMS
  const challenge = await OtpChallenge.findOneAndUpdate(
    { phone },
    {
      $set: {
        codeHash,
        expiresAt: new Date(Date.now() + otpLifetimeMs),
        attemptsUsed: 0
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );

  try {
    // Send OTP through Renflair
    await renflairSms.sendOtp(phone, code);
  } catch (error) {
    // Delete only this request's challenge.
    // Do not accidentally delete a newer OTP challenge.
    await OtpChallenge.deleteOne({
      _id: challenge._id,
      codeHash
    }).catch(() => {});

    throw error;
  }

  res.status(200).json({
    message: 'Verification code sent'
  });
}

// Verify customer OTP
export async function verifyUserOtp(req, res) {
  const { phone, code } = req.body;

  const challenge = await OtpChallenge.findOne({
    phone,
    expiresAt: { $gt: new Date() },
    attemptsUsed: { $lt: maxOtpAttempts }
  });

  if (!challenge) {
    throw new AppError(
      401,
      'Invalid or expired verification code'
    );
  }

  // Check OTP
  if (!matchesOtp(phone, code, challenge.codeHash)) {
    await OtpChallenge.updateOne(
      {
        _id: challenge._id,
        codeHash: challenge.codeHash,
        attemptsUsed: { $lt: maxOtpAttempts }
      },
      {
        $inc: { attemptsUsed: 1 }
      }
    );

    throw new AppError(
      401,
      'Invalid or expired verification code'
    );
  }

  // Atomically consume OTP to prevent reuse
  const consumedChallenge = await OtpChallenge.findOneAndDelete({
    _id: challenge._id,
    codeHash: challenge.codeHash,
    attemptsUsed: challenge.attemptsUsed,
    expiresAt: { $gt: new Date() }
  });

  if (!consumedChallenge) {
    throw new AppError(
      401,
      'Invalid or expired verification code'
    );
  }

  // Check whether customer already exists
  const user = await User.findOne({ phone });

  // New customer
  if (!user) {
    return res.status(200).json({
      isNewUser: true,
      verificationToken: createRegistrationToken(phone)
    });
  }

  // Existing customer
  return res.status(200).json({
    isNewUser: false,
    token: createToken(user._id, 'user'),
    user
  });
}

// Complete new customer registration
export async function completeUserRegistration(req, res) {
  const { verificationToken, name, email } = req.body;

  let claims;

  try {
    claims = jwt.verify(
      verificationToken,
      getJwtSecret(),
      {
        algorithms: ['HS256'],
        issuer: 'nalli-bokka-api'
      }
    );
  } catch {
    throw new AppError(
      401,
      'Invalid or expired registration token'
    );
  }

  if (
    typeof claims !== 'object' ||
    claims.purpose !== 'user-registration' ||
    typeof claims.sub !== 'string'
  ) {
    throw new AppError(
      401,
      'Invalid or expired registration token'
    );
  }

  const existingUser = await User.findOne({
    phone: claims.sub
  });

  if (existingUser) {
    throw new AppError(
      409,
      'An account already exists for this phone number'
    );
  }

  const user = await User.create({
    phone: claims.sub,
    name,
    ...(email ? { email } : {})
  });

  return res.status(201).json({
    isNewUser: true,
    token: createToken(user._id, 'user'),
    user
  });
}

// Store login
export async function loginStore(req, res) {
  const store = await Store.findOne({
    username: req.body.username.toLowerCase()
  }).select('+password');

  if (
    !store ||
    !(await store.comparePassword(req.body.password))
  ) {
    throw new AppError(
      401,
      'Invalid username or password'
    );
  }

  return res.status(200).json({
    token: createToken(store._id, 'store'),

    store: {
      id: store._id,
      storeName: store.storeName,
      username: store.username,
      location: store.location,
      isOpen: store.isOpen,
      minimumOrderValue: store.minimumOrderValue,
      openingTime: store.openingTime,
      closingTime: store.closingTime,
      storePhone: store.storePhone || store.storeNumber,
      googleMapsLink:
        store.googleMapsLink ||
        store.googleMapLink ||
        store.mapLink
    }
  });
}

// Get currently authenticated account
export async function getCurrentAccount(req, res) {
  const model = req.auth.role === 'store'
    ? Store
    : User;

  const account = await model.findById(req.auth.id);

  if (!account) {
    throw new AppError(
      401,
      'Account no longer exists'
    );
  }

  return res.status(200).json({
    account,
    role: req.auth.role
  });
}

