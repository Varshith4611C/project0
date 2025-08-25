const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

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
      // Redirect to profile with user ID
      res.redirect(`/profile/${user._id}`);
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
