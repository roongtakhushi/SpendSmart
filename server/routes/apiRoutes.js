const router = require("express").Router();
const c = require("../controllers/spendController");
const authCtrl = require("../controllers/authController");
const auth = require("../middleware/auth");

// --- Auth Routes (Public) ---
router.post("/auth/register", authCtrl.register);
router.post("/auth/login", authCtrl.login);
router.get("/auth/me", auth, authCtrl.me);
router.put("/auth/change-password", auth, authCtrl.changePassword);

// --- Transactions (Protected) ---
router.get("/transactions", auth, c.getTransactions);
router.post("/transactions", auth, c.createTransaction);
router.post("/transactions/process-recurring", auth, c.triggerRecurring);
router.put("/transactions/:id", auth, c.updateTransaction);
router.delete("/transactions/:id", auth, c.deleteTransaction);

// --- Budgets & Settings & Analytics (Protected) ---
router.get("/budgets", auth, c.getBudgets);
router.put("/budgets", auth, c.saveBudgets);
router.get("/settings", auth, c.getSettings);
router.put("/settings", auth, c.saveSettings);
router.get("/analytics", auth, c.getAnalytics);

// --- Goals (Protected) ---
router.get("/goals", auth, c.getGoals);
router.post("/goals", auth, c.createGoal);
router.put("/goals/:id", auth, c.updateGoal);
router.delete("/goals/:id", auth, c.deleteGoal);

module.exports = router;
