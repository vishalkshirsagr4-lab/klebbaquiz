const Notification = require('../models/Notification');
const { ApiError, asyncHandler } = require('../utils/helpers');

/**
 * List current user's notifications with unread count
 */
exports.list = asyncHandler(async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);

  res.json({
    items: notifications.map((n) => ({
      id: String(n._id),
      title: n.title,
      message: n.message,
      link: n.link,
      category: n.category,
      read: n.read,
      createdAt: n.createdAt,
    })),
    unreadCount,
  });
});

/**
 * Mark a specific notification as read
 */
exports.markRead = asyncHandler(async (req, res) => {
  const notif = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!notif) throw new ApiError(404, 'Notification not found', 'NOT_FOUND');

  notif.read = true;
  notif.readAt = new Date();
  await notif.save();

  res.json({ ok: true, id: String(notif._id) });
});

/**
 * Mark all notifications for current user as read
 */
exports.markAllRead = asyncHandler(async (req, res) => {
  const now = new Date();
  await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true, readAt: now } });
  res.json({ ok: true });
});
