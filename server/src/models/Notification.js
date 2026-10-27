const mongoose = require('mongoose');

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    competition: { type: Schema.Types.ObjectId, ref: 'Competition', required: true },
    announcement: { type: Schema.Types.ObjectId, ref: 'Announcement', required: true },
    version: { type: Number, default: 1 },
    type: { type: String, default: 'result_announcement' },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    link: { type: String, default: '' },
    category: { type: String, default: 'final' },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Prevent duplicate notifications on republish / retry
notificationSchema.index({ user: 1, announcement: 1, version: 1 }, { unique: true });
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
