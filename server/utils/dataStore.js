const fs = require("fs");
const path = require("path");
const Transaction = require("../models/Transaction");
const AppData = require("../models/AppData");
const Goal = require("../models/Goal");
const User = require("../models/User");

const file = path.join(__dirname, "..", "data", "db.json");
const defaults = {
    users: [],
    transactions: [],
    budgets: {
        Food: 4000,
        Transport: 1500,
        Shopping: 2500,
        Education: 3000,
        Entertainment: 1000,
        Health: 1000,
        Other: 1500
    },
    settings: {
        name: "Student",
        currency: "INR"
    },
    goals: []
};

const mongo = () => require("mongoose").connection.readyState === 1;

function readFile() {
    if (!fs.existsSync(file)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(defaults, null, 2));
    }
    try {
        const raw = fs.readFileSync(file, "utf8");
        return JSON.parse(raw);
    } catch (e) {
        return { ...defaults };
    }
}

function writeFile(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ----------------- USERS -----------------
async function findUserByEmail(email) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (mongo()) {
        const u = await User.findOne({ email: cleanEmail }).lean();
        return u ? { ...u, id: String(u._id) } : null;
    }
    const db = readFile();
    const u = (db.users || []).find(x => x.email.toLowerCase() === cleanEmail);
    return u || null;
}

async function findUserById(id) {
    if (mongo()) {
        if (!require("mongoose").isValidObjectId(id)) return null;
        const u = await User.findById(id).lean();
        return u ? { ...u, id: String(u._id) } : null;
    }
    const db = readFile();
    return (db.users || []).find(x => String(x.id) === String(id)) || null;
}

async function createUser(data) {
    const cleanData = {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        password: data.password
    };
    if (mongo()) {
        const u = await User.create(cleanData);
        return { ...u.toObject(), id: String(u._id) };
    }
    const db = readFile();
    if (!db.users) db.users = [];
    const item = { ...cleanData, id: require("uuid").v4(), createdAt: new Date().toISOString() };
    db.users.push(item);
    writeFile(db);
    return item;
}

async function updateUserPassword(id, hashedPassword) {
    if (mongo()) {
        if (!require("mongoose").isValidObjectId(id)) return false;
        const u = await User.findByIdAndUpdate(id, { $set: { password: hashedPassword } });
        return !!u;
    }
    const db = readFile();
    if (!db.users) return false;
    const u = db.users.find(x => String(x.id) === String(id));
    if (!u) return false;
    u.password = hashedPassword;
    writeFile(db);
    return true;
}

// ----------------- TRANSACTIONS -----------------
async function allTransactions(userId) {
    if (mongo()) {
        const filter = userId ? { userId } : {};
        return (await Transaction.find(filter).sort({ date: -1, createdAt: -1 }).lean())
            .map(x => ({ ...x, id: String(x._id) }));
    }
    const rows = readFile().transactions || [];
    if (!userId) return rows;
    return rows.filter(t => t.userId === userId);
}

async function createTransaction(data) {
    if (mongo()) {
        const x = await Transaction.create(data);
        return { ...x.toObject(), id: String(x._id) };
    }
    const db = readFile();
    if (!db.transactions) db.transactions = [];
    const item = { ...data, id: require("uuid").v4(), createdAt: new Date().toISOString() };
    db.transactions.unshift(item);
    writeFile(db);
    return item;
}

async function updateTransaction(id, data, userId) {
    if (mongo()) {
        if (!require("mongoose").isValidObjectId(id)) return null;
        const filter = { _id: id };
        if (userId) filter.userId = userId;
        const x = await Transaction.findOneAndUpdate(filter, data, { new: true, runValidators: true }).lean();
        return x ? { ...x, id: String(x._id) } : null;
    }
    const db = readFile();
    if (!db.transactions) db.transactions = [];
    const i = db.transactions.findIndex(t => t.id === id && (!userId || t.userId === userId));
    if (i < 0) return null;
    db.transactions[i] = { ...db.transactions[i], ...data, id };
    writeFile(db);
    return db.transactions[i];
}

async function deleteTransaction(id, userId) {
    if (mongo()) {
        if (!require("mongoose").isValidObjectId(id)) return false;
        const filter = { _id: id };
        if (userId) filter.userId = userId;
        return !!(await Transaction.findOneAndDelete(filter));
    }
    const db = readFile();
    if (!db.transactions) return false;
    const n = db.transactions.length;
    db.transactions = db.transactions.filter(t => !(t.id === id && (!userId || t.userId === userId)));
    writeFile(db);
    return db.transactions.length !== n;
}

// ----------------- APP DATA (Budgets & Settings) -----------------
async function getValue(key, userId) {
    const uKey = userId ? `${userId}_${key}` : key;
    if (mongo()) {
        const d = await AppData.findOne({ key: uKey }).lean();
        return d ? d.value : (defaults[key] || {});
    }
    const db = readFile();
    return db[uKey] ?? defaults[key];
}

async function setValue(key, value, userId) {
    const uKey = userId ? `${userId}_${key}` : key;
    if (mongo()) {
        await AppData.findOneAndUpdate({ key: uKey }, { $set: { value, userId } }, { upsert: true, new: true });
        return value;
    }
    const db = readFile();
    db[uKey] = value;
    writeFile(db);
    return value;
}

// ----------------- GOALS -----------------
async function allGoals(userId) {
    if (mongo()) {
        const filter = userId ? { userId } : {};
        return (await Goal.find(filter).sort({ createdAt: -1 }).lean())
            .map(x => ({ ...x, id: String(x._id) }));
    }
    const rows = readFile().goals || [];
    if (!userId) return rows;
    return rows.filter(g => g.userId === userId);
}

async function createGoal(data) {
    if (mongo()) {
        const x = await Goal.create(data);
        return { ...x.toObject(), id: String(x._id) };
    }
    const db = readFile();
    if (!db.goals) db.goals = [];
    const item = { ...data, id: require("uuid").v4(), createdAt: new Date().toISOString() };
    db.goals.push(item);
    writeFile(db);
    return item;
}

async function updateGoal(id, data, userId) {
    if (mongo()) {
        if (!require("mongoose").isValidObjectId(id)) return null;
        const filter = { _id: id };
        if (userId) filter.userId = userId;
        const x = await Goal.findOneAndUpdate(filter, data, { new: true, runValidators: true }).lean();
        return x ? { ...x, id: String(x._id) } : null;
    }
    const db = readFile();
    if (!db.goals) db.goals = [];
    const i = db.goals.findIndex(g => g.id === id && (!userId || g.userId === userId));
    if (i < 0) return null;
    db.goals[i] = { ...db.goals[i], ...data, id };
    writeFile(db);
    return db.goals[i];
}

async function deleteGoal(id, userId) {
    if (mongo()) {
        if (!require("mongoose").isValidObjectId(id)) return false;
        const filter = { _id: id };
        if (userId) filter.userId = userId;
        return !!(await Goal.findOneAndDelete(filter));
    }
    const db = readFile();
    if (!db.goals) return false;
    const n = db.goals.length;
    db.goals = db.goals.filter(g => !(g.id === id && (!userId || g.userId === userId)));
    writeFile(db);
    return db.goals.length !== n;
}

module.exports = {
    findUserByEmail,
    findUserById,
    createUser,
    updateUserPassword,
    allTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getValue,
    setValue,
    allGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    mongo
};
