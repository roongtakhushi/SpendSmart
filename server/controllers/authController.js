const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const store = require("../utils/dataStore");

const JWT_SECRET = process.env.JWT_SECRET || "spendsmart_jwt_super_secret_key_college_project_2026";

function isValidEmail(email) {
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

exports.register = async (req, res, next) => {
    try {
        const { name, email, password, confirmPassword } = req.body || {};

        if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 50) {
            return res.status(400).json({ success: false, message: "Name must be between 2 and 50 characters." });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }

        if (!password || typeof password !== "string" || password.length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match." });
        }

        // Check if user already exists
        const existing = await store.findUserByEmail(email);
        if (existing) {
            return res.status(400).json({ success: false, message: "An account with this email already exists." });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await store.createUser({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword
        });

        // Initialize user settings with their name
        await store.setValue("settings", { name: newUser.name, currency: "INR" }, newUser.id);

        // Sign JWT token
        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, name: newUser.name },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            success: true,
            message: "Account created successfully!",
            data: {
                token,
                user: {
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email
                }
            }
        });
    } catch (e) {
        next(e);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body || {};

        if (!isValidEmail(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }

        if (!password || typeof password !== "string") {
            return res.status(400).json({ success: false, message: "Please enter your password." });
        }

        const user = await store.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid email or password." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid email or password." });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Logged in successfully!",
            data: {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                }
            }
        });
    } catch (e) {
        next(e);
    }
};

exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body || {};

        if (!currentPassword || !newPassword || !confirmNewPassword)
            return res.status(400).json({ success: false, message: "All password fields are required." });

        if (newPassword.length < 6)
            return res.status(400).json({ success: false, message: "New password must be at least 6 characters." });

        if (newPassword !== confirmNewPassword)
            return res.status(400).json({ success: false, message: "New passwords do not match." });

        const user = await store.findUserById(req.user.id);
        if (!user)
            return res.status(404).json({ success: false, message: "User not found." });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch)
            return res.status(401).json({ success: false, message: "Current password is incorrect." });

        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(newPassword, salt);
        await store.updateUserPassword(req.user.id, hashed);

        res.json({ success: true, message: "Password changed successfully!" });
    } catch (e) {
        next(e);
    }
};

exports.me = async (req, res, next) => {
    try {
        const user = await store.findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        res.json({
            success: true,
            data: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    } catch (e) {
        next(e);
    }
};
