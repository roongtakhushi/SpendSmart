const mongoose = require("mongoose");

const goalSchema = new mongoose.Schema({
    userId: { type: String, default: "default_user", index: true },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    target: { type: Number, required: true, min: 1 },
    saved: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: true });

module.exports = mongoose.models.Goal || mongoose.model("Goal", goalSchema);
