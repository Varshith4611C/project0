// server.js (additional /chat integration)
// Put this at top of file with your existing requires
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname)); // you already had this

// --- your existing mongoose connection and User model (keep as-is) ---
// (assumes you already have mongoose.connect(...) and User model defined)

// Add Conversation schema (per-user chat history)
const conversationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  messages: [
    {
      role: { type: String, enum: ["user", "model"], required: true },
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  updatedAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model("Conversation", conversationSchema);

// --- Chat endpoint ---
// Expects JSON body: { username: "theUser", message: "hi", model?: "gemini-1.5-flash-latest" }
app.post("/chat", async (req, res) => {
  try {
    const username = (req.body.username || "").toString();
    const text = (req.body.message || "").toString();
    const model = (req.body.model || "gemini-1.5-flash-latest").toString();

    if (!username || !text) return res.status(400).json({ error: "username and message required" });

    // Find user
    const user = await mongoose.model("User").findOne({ username });
    if (!user) return res.status(404).json({ error: "user not found" });

    // Get or create conversation
    let convo = await Conversation.findOne({ user: user._id });
    if (!convo) {
      convo = new Conversation({ user: user._id, messages: [] });
    }

    // Append user's message to convo & save
    convo.messages.push({ role: "user", text });
    convo.updatedAt = new Date();
    await convo.save();

    // Build Gemini 'contents' array from convo.messages
    const contents = convo.messages.map(msg => {
      return {
        role: msg.role === "user" ? "user" : "assistant",
        parts: [{ text: msg.text }]
      };
    });

    // If you have GOOGLE_API_KEY configured, call Gemini; otherwise return fallback reply
    if (!process.env.GOOGLE_API_KEY) {
      // Save fallback model reply
      const fallback = `Local-mode reply: I heard "${text}" — set GOOGLE_API_KEY to enable real AI.`;
      convo.messages.push({ role: "model", text: fallback });
      convo.updatedAt = new Date();
      await convo.save();
      return res.json({ reply: fallback });
    }

    // Gemini endpoint (v1beta generateContent)
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;

    const payload = {
      contents: contents
    };

    const apiRes = await axios.post(endpoint, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 120000
    });

    const data = apiRes.data;

    // Defensive parsing: look for candidates -> content -> parts -> text
    const replyParts = data?.candidates?.[0]?.content?.parts?.map(p => p?.text).filter(Boolean);
    const reply = replyParts && replyParts.length ? replyParts.join("\n") : null;

    if (!reply) {
      // surface remote API error if present
      const apiError = data?.error?.message || "No reply from Gemini";
      return res.status(502).json({ error: apiError });
    }

    // Save model reply to DB
    convo.messages.push({ role: "model", text: reply });
    convo.updatedAt = new Date();
    await convo.save();

    // Return reply
    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err?.response?.data || err.message || err);
    const message = err?.response?.data?.error?.message || "Server error";
    res.status(500).json({ error: message });
  }
});


// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Serve static files (HTML, images, CSS)

// MongoDB Atlas connection
const MONGO_URI = process.env.MONGO_URI; // Set this in Render env variables

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.log("❌ MongoDB connection error:", err));

// User schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true }, // In production, hash this
  joinDate: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now },
  achievements: { type: [String], default: ["First Login"] }
});

const User = mongoose.model("User", userSchema);

// Serve HTML at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "project0.html"));
});

// Login route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username, password });
    if (user) {
      // Update last login
      user.lastLogin = new Date();
      await user.save();
      // Redirect to chat with user ID
      res.redirect(`/chat.html?username=${encodeURIComponent(user.username)}`);

    } else {
      res.send("<h1>Login failed ❌</h1><p>Invalid username or password</p>");
    }
  } catch (err) {
    console.error(err);
    res.send("<h1>Server error ❌</h1>");
  }
});

// Serve signup HTML
app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

// Handle signup form POST
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.send("<h1>User already exists ❌</h1><p>Try a different username.</p>");
    }

    // Create new user
    const newUser = new User({ username, password });
    await newUser.save();

    res.send("<h1>Signup successful 🎉</h1><p>You can now <a href='/'>login</a></p>");
  } catch (err) {
    console.error(err);
    res.send("<h1>Server error ❌</h1>");
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

