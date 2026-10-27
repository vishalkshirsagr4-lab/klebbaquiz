const mongoose = require('mongoose');

const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorLabel: { type: String, maxlength: 200 },
    action: { type: String, required: true, index: true },
    entityType: { type: String },
    entityId: { type: String },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String, maxlength: 300 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
