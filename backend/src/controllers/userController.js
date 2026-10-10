import User from '../models/User.js';
import AppError from '../utils/AppError.js';

async function getUser(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return user;
}

export async function getProfile(req, res) {
  res.json({ data: await getUser(req.auth.id) });
}

export async function updateProfile(req, res) {
  const user = await getUser(req.auth.id);
  if (req.body.name !== undefined) {
    user.name = req.body.name;
  }
  if (req.body.email !== undefined) {
    user.email = req.body.email || undefined;
  }
  await user.save();
  res.json({ data: user });
}

export async function addAddress(req, res) {
  const user = await getUser(req.auth.id);
  user.addresses.push(req.body);
  await user.save();
  res.status(201).json({ data: user.addresses.at(-1) });
}

export async function updateAddress(req, res) {
  const user = await getUser(req.auth.id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) {
    throw new AppError(404, 'Address not found');
  }
  Object.assign(address, req.body);
  await user.save();
  res.json({ data: address });
}

export async function deleteAddress(req, res) {
  const user = await getUser(req.auth.id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) {
    throw new AppError(404, 'Address not found');
  }
  address.deleteOne();
  await user.save();
  res.status(204).end();
}
