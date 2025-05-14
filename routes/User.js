const express = require("express");
const router = express.Router();
const UserController = require("../controller/UserController");
const passport = require("passport");
const multer = require("multer");

router.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./Uploads");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + file.originalname);
  },
});

const upload = multer({ storage: storage });

router.post("/add", UserController.add);
router.get("/getAll", UserController.getAll);
router.get("/getUser/:id", UserController.getById);
router.get("/getByName/:name", UserController.getByName);
router.put("/update/:id", UserController.update);
router.delete("/delete/:id", UserController.deleteUser);
router.delete("/deleteAll", UserController.deleteAll);

router.post("/forgot-password", UserController.forgotPassword);
router.post("/reset-password", UserController.resetPassword);

router.post("/face-login", UserController.faceLogin);
router.post("/register-face", UserController.registerFace);

router.get("/verify/:userId/:uniqueString", UserController.verifyEmail);
router.get("/verified", UserController.verifiedPage);

router.post("/signin", UserController.signin);
router.get("/logout", UserController.logout);
router.get("/refresh-session", UserController.refreshSession);

router.post("/send-otp", UserController.sendOTPVerificationEmail);
router.post("/verify-otp", UserController.verifyOTPNoPassport);
router.post("/resend-otp", UserController.resendOTPVerificationCode);

router.get("/profile/:id", UserController.getUserProfile);
router.put("/progress/:id", UserController.updateUserProgress);
router.post("/create-profile", UserController.createUserProfile);

router.get("/rankings", UserController.getRankings);
router.get("/current-user", UserController.getCurrentUser);
router.post("/update-profile-image/:id", upload.single("image"), UserController.updateProfileImage);

router.get("/generate-token", UserController.generateToken);

router.get("/instructors", UserController.getInstructors); 


module.exports = router;