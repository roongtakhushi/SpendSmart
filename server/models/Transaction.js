const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  userId: { type: String, default: "default_user", index: true },
  title: { type: String, required: true, trim: true, maxlength: 70 },
  amount: { type: Number, required: true, min: 0.01 },
  type: { type: String, enum: ["income", "expense"], required: true },
  category: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  note: { type: String, default: "", maxlength: 180 },
  recurring: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.Transaction || mongoose.model("Transaction", transactionSchema);
