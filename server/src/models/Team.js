const mongoose = require('mongoose');

const { Schema } = mongoose;

const teamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, unique: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    leader: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    competition: { type: Schema.Types.ObjectId, ref: 'Competition', index: true },
    maxMembers: { type: Number, default: 4, min: 1, max: 20 },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

teamSchema.index({ isActive: 1, competition: 1 });

module.exports = mongoose.model('Team', teamSchema);
