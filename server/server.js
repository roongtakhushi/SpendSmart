require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const routes = require("./routes/apiRoutes");
const controller = require("./controllers/spendController");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

let dbReadyPromise = null;

async function ensureDbConnected() {
    if (mongoose.connection.readyState === 1) return;
    if (!dbReadyPromise) {
        dbReadyPromise = (async () => {
            if (process.env.MONGODB_URI && process.env.MONGODB_URI.trim()) {
                try {
                    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
                    console.log("✅ Connected to MongoDB Atlas");
                } catch (err) {
                    console.warn("⚠️  Could not connect to MongoDB Atlas:", err.message);
                    console.warn("👉 Gracefully falling back to local JSON storage (server/data/db.json).");
                }
            } else {
                console.log("ℹ️  MONGODB_URI not set — using local JSON storage (server/data/db.json)");
            }
        })();
    }
    await dbReadyPromise;
}

app.use(async (req, res, next) => {
    await ensureDbConnected();
    next();
});

app.get("/api/health", controller.getHealth);
app.use("/api", routes);

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ success: false, message: "Something went wrong on the server." });
});

async function start() {
    await ensureDbConnected();

    // Auto-check recurring transactions on server start
    try {
        const recurringResult = await controller.processRecurringTransactions();
        if (recurringResult && recurringResult.created > 0) {
            console.log(`🔄 Auto-generated ${recurringResult.created} recurring transaction(s) for the current month.`);
        }
    } catch (e) {
        console.error("Error processing recurring transactions:", e.message);
    }

    app.listen(PORT, () => {
        console.log(`🚀 SpendSmart running at http://localhost:${PORT}`);
    });
}

if (require.main === module) {
    start().catch(err => {
        console.error("Could not start SpendSmart:", err.message);
        process.exit(1);
    });
}

module.exports = app;
