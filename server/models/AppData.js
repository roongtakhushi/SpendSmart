const mongoose = require("mongoose");

const appDataSchema = new mongoose.Schema({
  userId: { type: String, default: "default_user", index: true },
  key: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

appDataSchema.index({ userId: 1, key: 1 }, { unique: true });

module.exports = mongoose.models.AppData || mongoose.model("AppData", appDataSchema);
