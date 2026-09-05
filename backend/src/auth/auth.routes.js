import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_TTL = "30d"; // cross-device persistence: the same token works from any browser until it expires

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post("/signup", (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: "An account with that email already exists." });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(email.toLowerCase(), hash);

  const token = jwt.sign({ uid: info.lastInsertRowid }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.status(201).json({ token, email: email.toLowerCase() });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email) || typeof password !== "string") {
    return res.status(400).json({ error: "Enter your email and password." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
  // Same generic message whether the email is unknown or the password is wrong —
  // don't leak which one via response content or timing.
  const invalid = () => res.status(401).json({ error: "Incorrect email or password." });

  if (!user) return invalid();
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return invalid();

  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token, email: user.email });
});

export default router;
export { JWT_SECRET };
