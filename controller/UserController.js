const User = require("../models/User");
const UserVerification = require("../models/UserVerification");
const UserOTPVerification = require("../models/UserOTPVerification");
const { google } = require("googleapis");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  secure: false,
  tls: {
    rejectUnauthorized: false,
  },
});

transporter.verify((error, success) => {
  if (error) console.log(error);
  else console.log("Ready to send emails");
});

async function add(req, res) {
  let { name, email, password, recaptchaToken, role } = req.body;
  name = name.trim();
  email = email.trim();
  password = password.trim();
  role = role || "user";

  if (!["admin", "instructor", "user"].includes(role)) {
    return res.json({ status: "FAILED", message: "Invalid role specified" });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ status: "FAILED", message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      creationDate: new Date(),
      verified: false,
    });

    const result = await newUser.save();
    sendVerificationEmail(result, res);
  } catch (err) {
    console.error("Error saving user:", err);
    res.json({ status: "FAILED", message: "Error creating user account!" });
  }
}

async function signin(req, res) {
  let { email, password } = req.body;
  email = email.trim();
  password = password.trim();

  if (!email || !password) {
    console.log("Signin: Empty credentials supplied for email:", email);
    return res.json({ status: "FAILED", message: "Empty credentials supplied!" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("Signin: User not found for email:", email);
      return res.json({ status: "FAILED", message: "Invalid credentials entered!" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log("Signin: Invalid password for email:", email);
      return res.json({ status: "FAILED", message: "Invalid password entered!" });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error("Signin: Session regeneration error for email:", email, err);
        return res.json({ status: "FAILED", message: "Session creation error" });
      }

      req.session.userId = user._id.toString();
      req.session.role = user.role;
      console.log("Signin: Session created for userId:", user._id, "Role:", user.role);
      console.log("Signin: Session ID:", req.sessionID);

      sendOTPVerificationEmail(user, res);
    });
  } catch (error) {
    console.error(`Signin: Login failed for ${email}:`, error.message);
    res.json({ status: "FAILED", message: error.message });
  }
}

const verifyOTPNoPassport = async (req, res) => {
  try {
    let { userId, otp } = req.body;
    console.log("VerifyOTPNoPassport: Attempting to verify OTP for userId:", userId, "OTP:", otp);

    if (!userId || !otp) {
      console.log("VerifyOTPNoPassport: Missing userId or OTP");
      throw new Error("Empty OTP details are not allowed");
    }

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log("VerifyOTPNoPassport: Invalid userId format");
      throw new Error("Invalid user ID format");
    }

    if (userId !== req.session.userId) {
      console.log("VerifyOTPNoPassport: Session userId mismatch");
      throw new Error("Unauthorized");
    }

    const UserOTPVerificationRecords = await UserOTPVerification.find({ userId });
    if (UserOTPVerificationRecords.length === 0) {
      console.log("VerifyOTPNoPassport: No OTP record found for userId:", userId);
      throw new Error("Account record doesn't exist or has been verified already.");
    }

    const latestRecord = UserOTPVerificationRecords.sort((a, b) => b.createdAt - a.createdAt)[0];
    const { expiresAt, otp: hashedOTP } = latestRecord;

    if (expiresAt < Date.now()) {
      console.log("VerifyOTPNoPassport: OTP expired for userId:", userId);
      await UserOTPVerification.deleteMany({ userId });
      throw new Error("Code has expired. Please request again.");
    }

    const validOTP = await bcrypt.compare(otp.toString(), hashedOTP);
    if (!validOTP) {
      console.log("VerifyOTPNoPassport: Invalid OTP for userId:", userId);
      throw new Error("Invalid code passed. Check your inbox.");
    }

    const userUpdateResult = await User.updateOne({ _id: userId }, { verified: true });
    if (userUpdateResult.matchedCount === 0) {
      console.log("VerifyOTPNoPassport: User not found for userId:", userId);
      throw new Error("User not found");
    }

    await UserOTPVerification.deleteMany({ userId });

    const user = await User.findById(userId);
    if (!user) {
      console.log("VerifyOTPNoPassport: User not found after verification for userId:", userId);
      throw new Error("User not found");
    }

    res.json({
      status: "VERIFIED",
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("VerifyOTPNoPassport: Error for userId:", req.body.userId, error.message);
    res.json({
      status: "FAILED",
      message: error.message || "Erreur lors de la vérification de l'OTP",
    });
  }
};

async function logout(req, res) {
  try {
    console.log("Logout: Session before destruction", req.session);
    if (!req.session) {
      console.log("Logout: No session found");
      return res.status(400).json({ status: "FAILED", message: "No session to logout" });
    }

    req.session.destroy((err) => {
      if (err) {
        console.error("Logout: Session destroy error", err);
        return res.status(500).json({ status: "FAILED", message: "Failed to destroy session" });
      }
      console.log("Logout: Session destroyed successfully");
      res.clearCookie("connect.sid", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      res.json({ status: "SUCCESS", message: "Logged out successfully" });
    });
  } catch (error) {
    console.error("Logout: General error", error);
    res.status(500).json({ status: "FAILED", message: "Logout failed" });
  }
}

async function refreshSession(req, res) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "No active session" });
  }

  req.session.touch();
  res.json({ message: "Session refreshed" });
}

async function getAll(req, res) {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: err.message });
  }
}

async function getById(req, res) {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid User ID format" });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getByName(req, res) {
  try {
    const user = await User.findOne({ name: req.params.name });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function update(req, res) {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid User ID format" });
    }
    const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json({ message: "User updated successfully", updatedUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function deleteUser(req, res) {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid User ID format" });
    }
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteAll(req, res) {
  try {
    const result = await User.deleteMany({});
    res.status(200).json({ message: `${result.deletedCount} users deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send("Email not found");
    }

    const token = crypto.randomBytes(20).toString("hex");
    user.resetToken = token;
    user.resetTokenExpiration = Date.now() + 3600000;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER || "ghazysaoudi007@gmail.com",
      to: email,
      subject: "🔐 Reset Your Password",
      html: passwordResetTemplate(resetLink),
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        return res.status(500).send("Error sending email");
      }
      res.status(200).send("Check your email for reset instructions");
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
}

async function resetPassword(req, res) {
  const { token, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    return res.status(400).send("Passwords do not match");
  }
  try {
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiration: { $gt: Date.now() },
    });
    if (!user) {
      return res.status(404).send("Invalid or expired token");
    }
    user.password = await bcrypt.hash(password, 10);
    user.resetToken = undefined;
    user.resetTokenExpiration = undefined;
    await user.save();
    res.status(200).send("Password updated successfully");
  } catch (error) {
    res.status(500).send("Server error");
  }
}

async function faceLogin(req, res) {
  const { facialId } = req.body;

  if (!facialId || typeof facialId !== "string") {
    return res.status(400).json({ message: "Valid Facial ID is required" });
  }

  try {
    const user = await User.findOne({ facialId });
    if (!user) {
      return res.status(404).json({ message: "No user found with this facial ID" });
    }

    req.session.userId = user._id;
    req.session.role = user.role;
    return res.json({
      message: "Login successful",
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Face login error:", err);
    return res.status(500).json({ message: "Server error during login" });
  }
}

async function registerFace(req, res) {
  const { facialId, name, email } = req.body;

  if (!facialId || !name || !email) {
    return res.status(400).json({ message: "Facial ID, name, and email are required" });
  }

  try {
    const existingUserByFace = await User.findOne({ facialId });
    if (existingUserByFace) {
      return res.status(409).json({ message: "This facial ID is already registered" });
    }

    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
      return res.status(409).json({ message: "This email is already registered" });
    }

    const user = new User({ name, email, facialId, role: "user" });
    await user.save();

    req.session.userId = user._id;
    req.session.role = user.role;
    return res.json({
      message: "Registration successful",
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Face registration error:", err);
    return res.status(500).json({ message: "Server error during registration" });
  }
}

const sendVerificationEmail = ({ _id, email }, res) => {
  const uniqueString = uuidv4() + _id;
  const currentUrl = process.env.FRONTEND_URL;

  const verificationUrl = `${currentUrl}/courses`;

  const mailOptions = {
    from: process.env.AUTH_EMAIL,
    to: email,
    subject: "Verify your email",
    html: emailVerificationTemplate(verificationUrl),
  };

  bcrypt
    .hash(uniqueString, 10)
    .then((hashedUniqueString) => {
      new UserVerification({
        userId: _id,
        uniqueString: hashedUniqueString,
        createdAt: Date.now(),
        expiresAt: Date.now() + 21600000,
      })
        .save()
        .then(() => {
          transporter
            .sendMail(mailOptions)
            .then(() =>
              res.json({ status: "PENDING", message: "Verification email sent" })
            )
            .catch((err) =>
              res.json({ status: "FAILED", message: "Email send failed" })
            );
        });
    });
};

const sendOTPVerificationEmail = async ({ _id, email }, res) => {
  try {
    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;

    const mailOptions = {
      from: process.env.AUTH_EMAIL,
      to: email,
      subject: "Verify Your Email",
      html: otpVerificationTemplate(otp),
    };

    const saltRounds = 10;
    const hashedOTP = await bcrypt.hash(otp, saltRounds);
    const newUserOTPVerification = new UserOTPVerification({
      userId: _id,
      otp: hashedOTP,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    await newUserOTPVerification.save();
    await transporter.sendMail(mailOptions);
    res.json({
      status: "PENDING",
      message: "OTP verification email sent successfully",
      data: { userId: _id, email },
    });
  } catch (error) {
    res.json({
      status: "FAILED",
      message: error.message,
    });
  }
};

const resendOTPVerificationCode = async (req, res) => {
  try {
    let { userId, email } = req.body;
    if (!userId || !email) {
      throw Error("Empty user details are not allowed");
    }

    await UserOTPVerification.deleteMany({ userId });
    sendOTPVerificationEmail({ _id: userId, email }, res);
  } catch (error) {
    res.json({
      status: "FAILED",
      message: error.message,
    });
  }
};

const verifyEmail = (req, res) => {
  const { userId, uniqueString } = req.params;

  UserVerification.findOne({ userId }).then((result) => {
    if (!result) return res.redirect(`${process.env.FRONTEND_URL}/team`);

    bcrypt.compare(uniqueString, result.uniqueString).then((match) => {
      if (!match) return res.redirect(`${process.env.FRONTEND_URL}/team`);

      User.updateOne({ _id: userId }, { verified: true }).then(() => {
        UserVerification.deleteOne({ userId }).then(() => {
          res.redirect(`${process.env.FRONTEND_URL}/team`);
        });
      });
    });
  });
};

const verifiedPage = (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/team`);
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

const updateUserProgress = async (req, res) => {
  try {
    const { moduleId, moduleName } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $push: { completedModules: { moduleId, moduleName } } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to update user progress" });
  }
};

const createUserProfile = async (req, res) => {
  const { name, email, password, role, level, completedModules } = req.body;

  try {
    if (!name || !email || !password || !role || !level) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (!["admin", "instructor", "user"].includes(role)) {
      return res.status(400).json({ error: "Invalid role specified" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword, role, level, completedModules });
    await user.save();

    res.status(201).json(user);
  } catch (error) {
    console.error("Error creating user profile:", error);
    res.status(400).json({ error: "Failed to create user profile" });
  }
};

const googleLoginCallback = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      console.error("Google login callback: No user found in req.user");
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=Authentication failed`);
    }

    req.session.userId = user._id.toString();
    req.session.role = user.role;
    console.log("Google login callback: Session created for user:", user.email, "Session ID:", req.sessionID);

    res.redirect(`${process.env.FRONTEND_URL}/classroom-courses`);
  } catch (error) {
    console.error("Google login callback error:", error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(error.message)}`);
  }
};

const generateToken = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: "FAILED", message: "Not authenticated" });
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ status: "FAILED", message: "User not found" });
    }

    const jwtToken = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ status: "SUCCESS", token: jwtToken });
  } catch (error) {
    console.error("Generate token error:", error);
    res.status(500).json({ status: "FAILED", message: "Failed to generate token" });
  }
};

async function getRankings(req, res) {
  try {
    const users = await User.find()
      .sort({ totalScore: -1 })
      .limit(6)
      .select("name totalScore spots updates profilePicture");
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching user rankings:", error);
    res.status(500).json({ error: "Error fetching user rankings" });
  }
}

async function getCurrentUser(req, res) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "No active session" });
    }

    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture || null,
    });
  } catch (error) {
    console.error("Error fetching current user:", error);
    res.status(500).json({ message: "Server error" });
  }
}

async function updateProfileImage(req, res) {
  try {
    const userId = req.params.id;
    console.log("File received:", req.file);

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.profilePicture !== "default.jpg") {
      const oldPath = path.join(__dirname, "../Uploads", user.profilePicture);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    user.profilePicture = req.file.filename;
    await user.save();

    res.status(200).json({ message: "Profile image updated", image: user.profilePicture });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}


async function getInstructors(req, res) {
  try {
    const instructors = await User.find({ role: "instructor" }).select(
      "name email profilePicture rating"
    );
    res.status(200).json(instructors);
  } catch (err) {
    console.error("Error fetching instructors:", err);
    res.status(500).json({ error: err.message });
  }
}




const emailVerificationTemplate = (verificationUrl) => `
  <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
    <h2 style="color: #007bff;">✅ Email Verification</h2>
    <p>Hello,</p>
    <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
    <div style="text-align: center; margin: 20px 0;">
      <a href="${verificationUrl}" 
         style="background-color: #007bff; color: #fff; padding: 12px 20px; 
                text-decoration: none; border-radius: 5px; font-weight: bold;">
        Verify Email
      </a>
    </div>
    <p>If you did not create this account, you can ignore this email.</p>
    <p>Best regards,</p>
    <p><strong>The Support Team</strong></p>
  </div>
`;

const passwordResetTemplate = (resetLink) => `
  <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
    <h2 style="color: #d32f2f;">🔒 Password Reset Request</h2>
    <p>Hello,</p>
    <p>You recently requested to reset your password. Click the button below to proceed:</p>
    <div style="text-align: center; margin: 20px 0;">
      <a href="${resetLink}" 
         style="background-color: #d32f2f; color: #fff; padding: 12px 20px; 
                text-decoration: none; border-radius: 5px; font-weight: bold;">
        Reset Password
      </a>
    </div>
    <p>If you didn't request this, you can safely ignore this email.</p>
    <p>Best regards,</p>
    <p><strong>The Support Team</strong></p>
  </div>
`;

const otpVerificationTemplate = (otp) => `
  <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
    <h2 style="color: #007bff;">🔢 Email Verification Code</h2>
    <p>Hello,</p>
    <p>Enter the code below in the app to verify your email address and complete the sign-in process:</p>
    <div style="text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; padding: 10px; border: 2px dashed #007bff; display: inline-block;">
      ${otp}
    </div>
    <p>This code <b>expires in 1 hour</b>.</p>
    <p>If you did not request this, please ignore this email.</p>
    <p>Best regards,</p>
    <p><strong>The Support Team</strong></p>
  </div>
`;


module.exports = {
  add,
  getAll,
  getById,
  getByName,
  update,
  deleteUser,
  deleteAll,
  resetPassword,
  forgotPassword,
  faceLogin,
  registerFace,
  verifyEmail,
  verifiedPage,
  sendOTPVerificationEmail,
  verifyOTPNoPassport,
  resendOTPVerificationCode,
  signin,
  logout,
  refreshSession,
  getUserProfile,
  updateUserProgress,
  createUserProfile,
  googleLoginCallback,
  getRankings,
  getCurrentUser,
  updateProfileImage,
  generateToken,
  getInstructors
  
};