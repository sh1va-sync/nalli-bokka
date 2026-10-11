import Notification from '../models/Notification.js';
import AppError from '../utils/AppError.js';

export async function listNotifications(req, res) {
  const { page, limit } = req.validated.query;
  const filter = { userId: req.auth.id };
  const [data, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, readAt: null })
  ]);

  res.json({
    data,
    unreadCount,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
}

export async function markNotificationRead(req, res) {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.validated.params.notificationId, userId: req.auth.id },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) {
    throw new AppError(404, 'Notification not found');
  }
  res.json({ data: notification });
}

export async function markAllNotificationsRead(req, res) {
  const result = await Notification.updateMany(
    { userId: req.auth.id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.json({ data: { updatedCount: result.modifiedCount } });
}
