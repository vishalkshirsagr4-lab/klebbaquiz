const mongoose = require('mongoose');

const { Schema } = mongoose;

const highlightSchema = new Schema(
  {
    rank: { type: Number, required: true },
    label: { type: String, default: 'Winner' }, // e.g. "1st Place - Champion", "Runner Up"
    recipient: { type: String, required: true }, // Team Name or Participant Name
    participantId: { type: String, default: '' },
    score: { type: Number, default: 0 },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const revisionSchema = new Schema(
  {
    revision: { type: Number, required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    message: { type: String, default: '' },
    publishedAt: { type: Date, default: Date.now },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const announcementSchema = new Schema(
  {
    competition: { type: Schema.Types.ObjectId, ref: 'Competition', required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200, default: 'Official Competition Results' },
    message: { type: String, trim: true, maxlength: 4000, default: '' },
    category: {
      type: String,
      enum: ['preliminary', 'final', 'revised', 'cancelled'],
      default: 'final',
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'retracted'],
      default: 'draft',
      index: true,
    },
    visibility: {
      type: String,
      enum: ['all', 'participants_only', 'leaders_only'],
      default: 'all',
    },
    highlights: [highlightSchema],
    scheduledAt: { type: Date },
    publishedAt: { type: Date },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    retractedAt: { type: Date },
    retractedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    retractReason: { type: String, trim: true, maxlength: 1000, default: '' },
    revision: { type: Number, default: 1 },
    revisionHistory: [revisionSchema],
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

module.exports = mongoose.model('Announcement', announcementSchema);
