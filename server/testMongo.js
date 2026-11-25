require("dotenv").config();
const mongoose = require("mongoose");

async function testConnection() {
    const uri = process.env.MONGODB_URI;
    console.log("=========================================");
    console.log("SpendSmart — MongoDB Connection Diagnostic");
    console.log("=========================================\n");

    if (!uri || !uri.trim()) {
        console.log("⚠️  MONGODB_URI is not set in .env.");
        console.log("👉 The app will continue using its local JSON database fallback (server/data/db.json).");
        console.log("👉 To connect MongoDB Atlas, paste your connection string into SpendSmart_FullStack/.env\n");
        process.exit(0);
    }

    // Mask credentials for display
    const masked = uri.replace(/\/\/(.*?):(.*?)@/, "//$1:****@");
    console.log(`Connecting to: ${masked}...`);

    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log("✅ Successfully connected to MongoDB Atlas!");
        console.log(`   Database Name: ${mongoose.connection.name}`);
        console.log(`   Host: ${mongoose.connection.host}`);
        console.log("\nAll SpendSmart collections are ready for read/write.\n");
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("❌ Could not connect to MongoDB Atlas:");
        console.error(`   Error: ${err.message}`);
        console.log("\n💡 Common fixes:");
        console.log("   1. Verify your database username and password in .env");
        console.log("   2. In MongoDB Atlas, go to Network Access -> Add IP Address -> 'Allow Access from Anywhere' (0.0.0.0/0)");
        console.log("   3. Check that your cluster is not paused.\n");
        process.exit(1);
    }
}

testConnection();
