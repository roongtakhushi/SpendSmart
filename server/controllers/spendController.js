const store = require("../utils/dataStore");

const validTypes = ["income", "expense"];

const allowedCurrencies = [
    "INR",
    "USD",
    "EUR",
    "GBP"
];

const categories = {
    expense: [
        "Food",
        "Transport",
        "Shopping",
        "Education",
        "Entertainment",
        "Health",
        "Bills",
        "Other"
    ],

    income: [
        "Salary",
        "Allowance",
        "Freelance",
        "Scholarship",
        "Gift",
        "Other"
    ]
};

// ================= VALIDATION HELPERS =================

function isValidDate(value) {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false;
    }

    const date = new Date(value + "T00:00:00.000Z");

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function badRequest(res, message) {
    return res.status(400).json({
        success: false,
        message
    });
}

function validAmount(value) {
    if (
        value === "" ||
        value === null ||
        value === undefined
    ) {
        return false;
    }

    const amount = Number(value);

    return (
        Number.isFinite(amount) &&
        amount > 0 &&
        amount <= 1000000000
    );
}

function validateTransaction(data) {

    if (
        typeof data.title !== "string" ||
        data.title.trim().length < 2 ||
        data.title.trim().length > 70
    ) {
        return "Title must contain 2 to 70 characters.";
    }

    if (!validAmount(data.amount)) {
        return "Amount must be greater than 0 and below 1 billion.";
    }

    if (!validTypes.includes(data.type)) {
        return "Transaction type must be income or expense.";
    }

    if (
        typeof data.category !== "string" ||
        !categories[data.type].includes(data.category)
    ) {
        return "Please select a valid category.";
    }

    if (!isValidDate(data.date)) {
        return "Please enter a valid date.";
    }

    if (
        data.note !== undefined &&
        (
            typeof data.note !== "string" ||
            data.note.trim().length > 180
        )
    ) {
        return "Note cannot exceed 180 characters.";
    }

    if (
        data.recurring !== undefined &&
        typeof data.recurring !== "boolean"
    ) {
        return "Recurring must be true or false.";
    }

    return null;
}

// ================= RECURRING TRANSACTIONS ENGINE =================

async function processRecurringTransactions(userId) {
    try {
        const rows = await store.allTransactions(userId);
        const recurringTemplates = rows.filter(t => t.recurring === true);
        if (recurringTemplates.length === 0) return { created: 0 };

        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

        let createdCount = 0;
        const templateMap = new Map();

        for (const t of recurringTemplates) {
            const key = `${t.title.trim().toLowerCase()}_${t.amount}_${t.type}_${t.category}`;
            if (!templateMap.has(key)) {
                templateMap.set(key, t);
            }
        }

        for (const [, t] of templateMap.entries()) {
            const existsInCurrentMonth = rows.some(r =>
                String(r.date).slice(0, 7) === currentMonth &&
                r.title.trim().toLowerCase() === t.title.trim().toLowerCase() &&
                Number(r.amount) === Number(t.amount) &&
                r.type === t.type
            );

            const templateMonth = String(t.date).slice(0, 7);
            if (!existsInCurrentMonth && templateMonth < currentMonth) {
                let day = parseInt(String(t.date).slice(8, 10), 10);
                if (isNaN(day) || day < 1) day = 1;
                if (day > daysInMonth) day = daysInMonth;
                const formattedDay = String(day).padStart(2, "0");
                const newDate = `${currentMonth}-${formattedDay}`;

                await store.createTransaction({
                    userId: userId || t.userId || "default_user",
                    title: t.title.trim(),
                    amount: Number(t.amount),
                    type: t.type,
                    category: t.category,
                    date: newDate,
                    note: t.note ? `${t.note} (Auto-recurring)` : "Auto-recurring",
                    recurring: true
                });
                createdCount++;
            }
        }

        return { created: createdCount };
    } catch (err) {
        console.error("Error in processRecurringTransactions:", err.message);
        return { created: 0, error: err.message };
    }
}

exports.processRecurringTransactions = processRecurringTransactions;

exports.triggerRecurring = async (req, res, next) => {
    try {
        const result = await processRecurringTransactions(req.user?.id);
        res.json({ success: true, ...result });
    } catch (e) {
        next(e);
    }
};

// ================= TRANSACTIONS =================

exports.getTransactions = async (req, res, next) => {
    try {
        await processRecurringTransactions(req.user?.id);
        let rows = await store.allTransactions(req.user?.id);

        const {
            month,
            type,
            category,
            search,
            from,
            to
        } = req.query;

        if (month && /^\d{4}-\d{2}$/.test(month)) {
            rows = rows.filter(
                t => String(t.date).slice(0, 7) === month
            );
        }

        if (type && validTypes.includes(type)) {
            rows = rows.filter(t => t.type === type);
        }

        if (category) {
            rows = rows.filter(t => t.category === category);
        }

        if (from && isValidDate(from)) {
            rows = rows.filter(t => t.date >= from);
        }

        if (to && isValidDate(to)) {
            rows = rows.filter(t => t.date <= to);
        }

        if (search) {
            const q = String(search).trim().toLowerCase();

            rows = rows.filter(t =>
                `${t.title} ${t.category} ${t.note || ""}`
                    .toLowerCase()
                    .includes(q)
            );
        }

        res.json({
            success: true,
            data: rows
        });

    } catch (e) {
        next(e);
    }
};

exports.createTransaction = async (req, res, next) => {
    try {
        const body = req.body || {};

        const error = validateTransaction(body);

        if (error) {
            return badRequest(res, error);
        }

        const item = await store.createTransaction({
            userId: req.user?.id || "default_user",
            title: body.title.trim(),
            amount: Number(body.amount),
            type: body.type,
            category: body.category,
            date: body.date,
            note: String(body.note || "").trim(),
            recurring: body.recurring === true
        });

        res.status(201).json({
            success: true,
            data: item
        });

    } catch (e) {
        next(e);
    }
};

exports.updateTransaction = async (req, res, next) => {
    try {
        const body = req.body || {};

        const allowedFields = [
            "title",
            "amount",
            "type",
            "category",
            "date",
            "note",
            "recurring"
        ];

        const update = {};

        for (const key of allowedFields) {
            if (
                Object.prototype.hasOwnProperty.call(body, key)
            ) {
                update[key] = body[key];
            }
        }

        if (Object.keys(update).length === 0) {
            return badRequest(
                res,
                "No valid transaction fields provided."
            );
        }

        const existingRows = await store.allTransactions(req.user?.id);

        const existing = existingRows.find(
            t => String(t.id) === String(req.params.id)
        );

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found."
            });
        }

        const merged = {
            ...existing,
            ...update
        };

        const error = validateTransaction(merged);

        if (error) {
            return badRequest(res, error);
        }

        if (update.title !== undefined) {
            update.title = update.title.trim();
        }

        if (update.amount !== undefined) {
            update.amount = Number(update.amount);
        }

        if (update.note !== undefined) {
            update.note = update.note.trim();
        }

        const item = await store.updateTransaction(
            req.params.id,
            update,
            req.user?.id
        );

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found."
            });
        }

        res.json({
            success: true,
            data: item
        });

    } catch (e) {
        next(e);
    }
};

exports.deleteTransaction = async (req, res, next) => {
    try {
        const deleted = await store.deleteTransaction(
            req.params.id,
            req.user?.id
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found."
            });
        }

        res.json({
            success: true,
            message: "Transaction deleted."
        });

    } catch (e) {
        next(e);
    }
};

// ================= BUDGETS =================

exports.getBudgets = async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await store.getValue("budgets", req.user?.id)
        });

    } catch (e) {
        next(e);
    }
};

exports.saveBudgets = async (req, res, next) => {
    try {
        const input = req.body;

        if (
            !input ||
            typeof input !== "object" ||
            Array.isArray(input)
        ) {
            return badRequest(
                res,
                "Budgets must be an object."
            );
        }

        const clean = {};

        for (const [key, value] of Object.entries(input)) {

            if (!categories.expense.includes(key)) {
                return badRequest(
                    res,
                    `Invalid budget category: ${key}.`
                );
            }

            if (
                value === "" ||
                value === null ||
                !Number.isFinite(Number(value)) ||
                Number(value) < 0 ||
                Number(value) > 1000000000
            ) {
                return badRequest(
                    res,
                    `Invalid budget amount for ${key}.`
                );
            }

            clean[key] = Number(value);
        }

        await store.setValue("budgets", clean, req.user?.id);

        res.json({
            success: true,
            data: clean
        });

    } catch (e) {
        next(e);
    }
};

// ================= SETTINGS =================

exports.getSettings = async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await store.getValue("settings", req.user?.id)
        });

    } catch (e) {
        next(e);
    }
};

exports.saveSettings = async (req, res, next) => {
    try {
        const body = req.body || {};

        const name = body.name === undefined
            ? "Student"
            : body.name;

        const currency = body.currency;

        if (
            typeof name !== "string" ||
            name.trim().length > 40
        ) {
            return badRequest(
                res,
                "Name cannot exceed 40 characters."
            );
        }

        if (!allowedCurrencies.includes(currency)) {
            return badRequest(
                res,
                "Choose a supported currency."
            );
        }

        const settings = {
            name: name.trim() || "Student",
            currency
        };

        await store.setValue("settings", settings, req.user?.id);

        res.json({
            success: true,
            data: settings
        });

    } catch (e) {
        next(e);
    }
};

// ================= ANALYTICS =================

exports.getAnalytics = async (req, res, next) => {
    try {
        const month = req.query.month ||
            new Date().toISOString().slice(0, 7);

        if (
            !/^\d{4}-\d{2}$/.test(month) ||
            Number(month.slice(5, 7)) < 1 ||
            Number(month.slice(5, 7)) > 12
        ) {
            return badRequest(
                res,
                "Month must be in YYYY-MM format."
            );
        }

        const rows = (
            await store.allTransactions(req.user?.id)
        ).filter(
            t => String(t.date).slice(0, 7) === month
        );

        const income = rows
            .filter(t => t.type === "income")
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const expenses = rows
            .filter(t => t.type === "expense")
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const byCategory = {};

        rows
            .filter(t => t.type === "expense")
            .forEach(t => {
                byCategory[t.category] =
                    (byCategory[t.category] || 0) +
                    Number(t.amount);
            });

        const days = {};

        rows.forEach(t => {
            const day = t.date.slice(8, 10);

            days[day] = (days[day] || 0) +
                (
                    t.type === "income"
                        ? Number(t.amount)
                        : -Number(t.amount)
                );
        });

        res.json({
            success: true,
            data: {
                month,
                income,
                expenses,
                balance: income - expenses,

                savingsRate: income
                    ? Math.round(
                        (income - expenses) / income * 100
                    )
                    : 0,

                byCategory,
                dailyNet: days,
                transactionCount: rows.length
            }
        });

    } catch (e) {
        next(e);
    }
};

// ================= GOALS =================

function validateGoal(data) {
    if (
        typeof data.name !== "string" ||
        data.name.trim().length < 2 ||
        data.name.trim().length > 50
    ) {
        return "Goal name must contain 2 to 50 characters.";
    }

    const target = Number(data.target);
    if (!Number.isFinite(target) || target < 1 || target > 1000000000) {
        return "Target amount must be at least 1 and below 1 billion.";
    }

    if (data.saved !== undefined) {
        const saved = Number(data.saved);
        if (!Number.isFinite(saved) || saved < 0 || saved > target) {
            return "Saved amount must be between 0 and the target amount.";
        }
    }

    return null;
}

exports.getGoals = async (req, res, next) => {
    try {
        const rows = await store.allGoals(req.user?.id);
        res.json({
            success: true,
            data: rows
        });
    } catch (e) {
        next(e);
    }
};

exports.createGoal = async (req, res, next) => {
    try {
        const body = req.body || {};
        const error = validateGoal(body);
        if (error) {
            return badRequest(res, error);
        }

        const item = await store.createGoal({
            userId: req.user?.id || "default_user",
            name: body.name.trim(),
            target: Number(body.target),
            saved: Number(body.saved || 0)
        });

        res.status(201).json({
            success: true,
            data: item
        });
    } catch (e) {
        next(e);
    }
};

exports.updateGoal = async (req, res, next) => {
    try {
        const body = req.body || {};
        const update = {};

        if (body.name !== undefined) {
            if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 50) {
                return badRequest(res, "Goal name must contain 2 to 50 characters.");
            }
            update.name = body.name.trim();
        }

        if (body.target !== undefined) {
            const target = Number(body.target);
            if (!Number.isFinite(target) || target < 1 || target > 1000000000) {
                return badRequest(res, "Target amount must be at least 1 and below 1 billion.");
            }
            update.target = target;
        }

        if (body.saved !== undefined) {
            const saved = Number(body.saved);
            if (!Number.isFinite(saved) || saved < 0) {
                return badRequest(res, "Saved amount must be 0 or greater.");
            }
            update.saved = saved;
        }

        if (Object.keys(update).length === 0) {
            return badRequest(res, "No valid goal fields provided.");
        }

        const existingGoals = await store.allGoals(req.user?.id);
        const existing = existingGoals.find(g => String(g.id) === String(req.params.id));
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Goal not found."
            });
        }

        const mergedTarget = update.target !== undefined ? update.target : Number(existing.target);
        const mergedSaved  = update.saved !== undefined ? update.saved : Number(existing.saved);
        if (mergedSaved > mergedTarget) {
            return badRequest(res, "Saved amount cannot exceed target amount.");
        }

        const item = await store.updateGoal(req.params.id, update, req.user?.id);
        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Goal not found."
            });
        }

        res.json({
            success: true,
            data: item
        });
    } catch (e) {
        next(e);
    }
};

exports.deleteGoal = async (req, res, next) => {
    try {
        const deleted = await store.deleteGoal(req.params.id, req.user?.id);
        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Goal not found."
            });
        }

        res.json({
            success: true,
            message: "Goal deleted."
        });
    } catch (e) {
        next(e);
    }
};

// ================= API HEALTH =================

exports.getHealth = (req, res) => {
    res.json({
        success: true,
        message: "SpendSmart API is running",
        database: store.mongo()
            ? "MongoDB"
            : "Local JSON fallback"
    });
};