require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const cors = require("cors");
const crypto = require("crypto");
const passport = require("./config/passport");
const axios = require("axios");
const { generateZoomMeeting } = require("./zoom.service");
const Course = require("./models/Course");
const path = require("path");
const UserController = require("./controller/UserController");
const User = require("./models/User");
const config = require("./config/dbconnexion.json");
const EmotionRoutes = require("./routes/emotion.js");
const ReclamationRoutes = require("./routes/Reclamation.js");
const { summarizeText } = require("./controller/summarizer.js");
const fs = require("fs");
const multer = require('multer');
const pdfParse = require("pdf-parse"); 
const EventRoutes = require("./routes/event.js");






mongoose
  .connect(config.url, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("Database connected"))
  .catch((err) => console.error("Database not connected:", err));

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});
mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected, attempting to reconnect...");
  mongoose.connect(config.url, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
  });
});

const app = express();

app.set("view engine", "ejs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const secret = process.env.SESSION_SECRET || crypto.randomBytes(64).toString("hex");
app.use(
  session({
    secret: secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: config.url,
      collectionName: "sessions",
      ttl: 24 * 60 * 60,
      autoRemove: "native",
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS","PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "github-token"],
  })
);

app.use((req, res, next) => {
  console.log("Request URL:", req.url);
  console.log("Session ID:", req.sessionID);
  console.log("Session data:", req.session);
  console.log("Authenticated user:", req.user ? req.user.email : "undefined");
  console.log("Is authenticated:", req.isAuthenticated());
  console.log("Cookies:", req.cookies);
  next();
});

const UserRoutes = require("./routes/User.js");
const CourseRoutes = require("./routes/Course.js");
const ChatbotRoutes = require("./routes/Chatbot.js");
const questionRoutes = require("./routes/Questions.js");
const reponseRoutes = require("./routes/Response.js");
const quizRoutes = require("./routes/Quiz.js");
const scoreQuizRoutes = require("./routes/ScoreQuiz.js");

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email", "https://www.googleapis.com/auth/classroom.courses.readonly"],
  })
);
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: `${process.env.FRONTEND_URL}/login?error=Authentication failed` }),
  UserController.googleLoginCallback
);

app.get("/auth/facebook", passport.authenticate("facebook", { scope: ["email"] }));
app.get(
  "/auth/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/courses`);
  }
);

app.get("/auth/github", passport.authenticate("github", { scope: ["user:email"] }));
app.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/courses`);
  }
);

app.get("/auth/linkedin", passport.authenticate("linkedin", { scope: ["openid", "profile", "email"] }));
app.get(
  "/auth/linkedin/callback",
  passport.authenticate("linkedin", { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/courses`);
  }
);

app.get("/auth/current_user", async (req, res) => {
  if (req.session.userId) {
    try {
      const user = await User.findById(req.session.userId);
      if (!user) {
        console.log("Current user: User not found for session userId:", req.session.userId);
        return res.status(401).json({ message: "Not authenticated" });
      }
      console.log("Current user:", user.email);
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    } catch (err) {
      console.error("Current user error:", err);
      res.status(500).json({ message: "Server error" });
    }
  } else {
    console.log("No authenticated user");
    res.status(401).json({ message: "Not authenticated" });
  }
});

app.get("/github/repos", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Please log in to fetch GitHub repos" });
  }
  const githubToken = req.headers["github-token"];
  if (!githubToken) {
    return res.status(400).json({ message: "GitHub token is required" });
  }
  try {
    const response = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const repos = response.data.map((repo) => ({
      name: repo.name,
      language: repo.language || "Not specified",
    }));
    res.json({ status: "SUCCESS", data: repos });
  } catch (error) {
    console.error("GitHub API Error:", error.response?.data || error.message);
    res.status(500).json({ message: "Failed to fetch GitHub repos" });
  }
});

app.get("/github/courses-by-repo-language/:repoName", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Please log in to fetch courses" });
  }
  const { repoName } = req.params;
  const githubToken = req.headers["github-token"];
  if (!githubToken) {
    return res.status(400).json({ message: "GitHub token is required" });
  }
  try {
    const allReposResponse = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const repo = allReposResponse.data.find((r) => r.name === repoName);
    if (!repo) {
      return res.status(404).json({ message: `Repository ${repoName} not found` });
    }
    const owner = repo.owner.login;
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const programmingLanguage = response.data.language ? response.data.language.toLowerCase() : null;
    let courses = [];
    if (programmingLanguage) {
      if (programmingLanguage === "javascript") {
        courses = await Course.find({ programmingLanguage: "javascript" });
      } else if (programmingLanguage === "php") {
        courses = await Course.find({ programmingLanguage: "php" });
      } else if (programmingLanguage === "css") {
        courses = await Course.find({ programmingLanguage: "css" });
      } else {
        courses = await Course.find({ programmingLanguage });
      }
    }
    res.status(200).json({ status: "SUCCESS", data: courses });
  } catch (error) {
    console.error("Error fetching courses:", error.response?.data || error.message);
    res.status(500).json({ message: "Failed to fetch courses" });
  }
});

app.post("/api/zoom/meeting", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized: Please log in" });
  }
  const { courseId } = req.body;
  try {
    const meetingData = await generateZoomMeeting(courseId);
    res.json({
      join_url: meetingData.join_url,
      meeting_id: meetingData.id,
      password: meetingData.password,
    });
  } catch (error) {
    console.error("Zoom meeting creation error:", error);
    res.status(500).json({ message: "Failed to create Zoom meeting", error: error.message });
  }
});

app.get("/terms", (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>Conditions de service</h1>
        <p>Ceci est une condition de service temporaire pour les tests. Utilisez cette app de manière responsable.</p>
      </body>
    </html>
  `);
});




// iheb 




// Configure Multer for file uploads
const uploadDir = path.join(__dirname, "Uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "Uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage });

// Route for uploading and summarizing a PDF file
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const buffer = await fs.promises.readFile(req.file.path);
    const pdfData = await pdfParse(buffer);
    const summary = await summarizeText(pdfData.text);
    res.json({ summary });
  } catch (error) {
    console.error("Error summarizing PDF:", error);
    res.status(500).json({ error: "Error summarizing PDF" });
  }
});

// Route for summarizing plain text
app.post("/summarize-text", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Text is required for summarization" });
    }
    const summary = await summarizeText(text);
    res.json({ summary });
  } catch (error) {
    console.error("Error summarizing text:", error);
    res.status(500).json({ error: "Error summarizing text" });
  }
});

//







app.use("/uploads", express.static("uploads"));
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));

app.use("/user", UserRoutes);
app.use("/course", CourseRoutes);
app.use("/chatbot", ChatbotRoutes);
app.use("/questions", questionRoutes);
app.use("/responses", reponseRoutes);
app.use("/quiz", quizRoutes);
app.use("/scoreQuizzes", scoreQuizRoutes);
app.use("/emotion", EmotionRoutes);
app.use("/reclamation", ReclamationRoutes);
app.use("/event", EventRoutes);



//const server = http.createServer(app);
//server.listen(3000, () => console.log("Server running on port 3000"));

module.exports = app;