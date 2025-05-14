require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const twilio = require("twilio");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const { google } = require("googleapis");
const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const User = require("../models/User");
const { generateVideoSummary } = require("../services/videoSummaryService");
const { generateTutorVideo, getTutorVideoStatus } = require("../services/didService");

// List of valid driver IDs (must match didService.js)
const VALID_DRIVER_IDS = [
  "amy-A8j7Zg1oQ",
  "bill-0bL2B8z4W",
  "sarah-7nL9mX3kP",
  "john-K6j8Y2v5T",
];

// Twilio Client
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Multer Configuration for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "Uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage }).single("thumb");

// Add a Course with optional AI Tutor Video
async function add(req, res) {
  upload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ status: "FAILED", message: `File upload error: ${err.message}` });
    }

    let {
      title,
      price,
      description,
      category,
      rating,
      skill_level,
      price_type,
      language,
      popular,
      tutorScript,
      programmingLanguage,
    } = req.body;
    const thumb = req.file ? `/Uploads/${req.file.filename}` : "/Uploads/default.jpg";

    // Trim string inputs
    title = title?.trim();
    description = description?.trim();
    category = category?.trim();
    skill_level = skill_level?.trim();
    price_type = price_type?.trim();
    language = language?.trim();
    programmingLanguage = programmingLanguage?.trim();

    // Validate required fields
    if (!title || !price || !category) {
      console.log("Missing required fields:", { title, price, category });
      return res.status(400).json({ status: "FAILED", message: "Title, price, and category are required" });
    }

    // Parse and validate numeric fields
    price = parseFloat(price);
    if (isNaN(price) || price < 0) {
      console.log("Invalid price:", price);
      return res.status(400).json({ status: "FAILED", message: "Price must be a non-negative number" });
    }

    rating = rating ? parseFloat(rating) : 0;
    if (rating < 0 || rating > 5) {
      console.log("Invalid rating:", rating);
      return res.status(400).json({ status: "FAILED", message: "Rating must be between 0 and 5" });
    }

    // Parse boolean field
    popular = popular === "true" || popular === true;

    // Validate enums
    if (skill_level && !["Beginner", "Intermediate", "Advanced"].includes(skill_level)) {
      console.log("Invalid skill_level:", skill_level);
      return res.status(400).json({ status: "FAILED", message: "Skill level must be Beginner, Intermediate, or Advanced" });
    }
    if (price_type && !["Free", "Paid"].includes(price_type)) {
      console.log("Invalid price_type:", price_type);
      return res.status(400).json({ status: "FAILED", message: "Price type must be Free or Paid" });
    }

    try {
      // Get current instructor from session
      const user = await User.findById(req.session.userId);
      if (!user) {
        console.log("User not found for session:", req.session.userId);
        return res.status(401).json({ status: "FAILED", message: "Instructor not found" });
      }
      const instructors = user.name || user.email; // Use name if available, else email

      // Check for existing course
      const existingCourse = await Course.findOne({ title });
      if (existingCourse) {
        console.log("Course title already exists:", title);
        return res.status(400).json({ status: "FAILED", message: "Course title already exists" });
      }

      // Generate AI tutor video if tutorScript is provided
      let aiTutorVideo = "";
      if (tutorScript && tutorScript.trim()) {
        console.log("Generating AI tutor video for script:", tutorScript);
        const videoData = await generateTutorVideo({ script: tutorScript });
        aiTutorVideo = videoData.videoUrl;
      }

      // Create new course with all fields
      const newCourse = new Course({
        title,
        price,
        description,
        category,
        instructors, // Set from user
        rating,
        thumb,
        skill_level,
        price_type,
        language,
        popular,
        programmingLanguage,
        aiTutorVideo,
      });

      const result = await newCourse.save();
      console.log("Course added successfully:", result._id);
      res.json({ status: "SUCCESS", message: "Course added successfully", data: result });
    } catch (error) {
      console.error("Error adding course:", error);
      res.status(500).json({ status: "FAILED", message: `Failed to add course: ${error.message}` });
    }
  });
}

// Get All Courses
async function getAll(req, res) {
  try {
    const courses = await Course.find();
    res.status(200).json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get Courses by Current Instructor
async function getByInstructor(req, res) {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      console.log("User not found for session:", req.session.userId);
      return res.status(401).json({ status: "FAILED", message: "Instructor not found" });
    }
    const instructor = user.name || user.email;
    const courses = await Course.find({ instructors: instructor });
    console.log(`Fetched ${courses.length} courses for instructor: ${instructor}`);
    res.status(200).json(courses);
  } catch (error) {
    console.error("Error fetching instructor courses:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get Courses by User Role
async function getCoursesByRole(req, res) {
  try {
    if (!req.session.userId) {
      // Unauthenticated users see all courses
      const courses = await Course.find();
      console.log(`Fetched ${courses.length} courses for unauthenticated user`);
      return res.status(200).json(courses);
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      console.log("User not found for session:", req.session.userId);
      return res.status(401).json({ status: "FAILED", message: "User not found" });
    }

    if (user.role === "user") {
      // Regular users see all courses
      const courses = await Course.find();
      console.log(`Fetched ${courses.length} courses for user: ${user.email}`);
      res.status(200).json(courses);
    } else if (user.role === "instructor") {
      // Instructors see only their own courses
      const instructor = user.name || user.email;
      const courses = await Course.find({ instructors: instructor });
      console.log(`Fetched ${courses.length} courses for instructor: ${instructor}`);
      res.status(200).json(courses);
    } else {
      console.log("Invalid role for user:", user.role);
      res.status(403).json({ status: "FAILED", message: "Invalid user role" });
    }
  } catch (error) {
    console.error("Error fetching courses by role:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get Course by ID
async function getById(req, res) {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid Course ID format" });
    }
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found" });
    res.status(200).json(course);
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({ error: error.message });
  }
}

// Update a Course with optional AI Tutor Video
async function update(req, res) {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid Course ID format" });
    }
    const { tutorScript, ...updateData } = req.body;
    if (tutorScript && tutorScript.trim()) {
      console.log("Generating AI tutor video for update:", tutorScript);
      const videoData = await generateTutorVideo({ script: tutorScript });
      updateData.aiTutorVideo = videoData.videoUrl;
    }
    // Parse popular as boolean if provided
    if (updateData.popular !== undefined) {
      updateData.popular = updateData.popular === "true" || updateData.popular === true;
    }
    const updatedCourse = await Course.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!updatedCourse) return res.status(404).json({ error: "Course not found" });
    console.log("Course updated successfully:", updatedCourse._id);
    res.status(200).json({ message: "Course updated successfully", updatedCourse });
  } catch (error) {
    console.error("Error updating course:", error);
    res.status(400).json({ error: error.message });
  }
}

// Delete a Course
async function deleteCourse(req, res) {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid Course ID format" });
    }
    const deletedCourse = await Course.findByIdAndDelete(req.params.id);
    if (!deletedCourse) return res.status(404).json({ error: "Course not found" });
    console.log("Course deleted successfully:", deletedCourse._id);
    res.status(200).json({ message: "Course deleted successfully" });
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).json({ error: error.message });
  }
}

// Create Checkout Session with Stripe
async function createCheckout(req, res) {
  try {
    const { courses } = req.body;
    if (!courses || courses.length === 0) {
      console.log("No courses selected for checkout");
      return res.status(400).json({ status: "FAILED", message: "No courses selected for checkout" });
    }

    const line_items = courses.map((course) => ({
      price_data: {
        currency: "usd",
        product_data: { name: course.title, description: course.desc || course.description },
        unit_amount: Math.round(course.price * 100),
      },
      quantity: course.quantity || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      line_items,
      mode: "payment",
      shipping_address_collection: { allowed_countries: ["US", "BR"] },
      success_url: `${process.env.BASE_URL}/course/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/course/cancel`,
    });

    console.log("Checkout session created:", session.id);
    res.json({ status: "SUCCESS", url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ status: "FAILED", message: error.message });
  }
}

// Complete Payment and Send SMS
async function completePayment(req, res) {
  try {
    const [session, lineItems] = await Promise.all([
      stripe.checkout.sessions.retrieve(req.query.session_id, { expand: ["payment_intent.payment_method"] }),
      stripe.checkout.sessions.listLineItems(req.query.session_id),
    ]);

    if (session.payment_status === "paid") {
      const userPhoneNumber = "+21699516931";
      await twilioClient.messages.create({
        body: `Votre paiement de ${session.amount_total / 100} ${session.currency.toUpperCase()} a été effectué avec succès.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: userPhoneNumber,
      });

      console.log("Payment completed, SMS sent:", session.id);
      res.json({
        status: "SUCCESS",
        message: "Paiement réussi. Un SMS de confirmation a été envoyé.",
        data: { session, lineItems },
      });
    } else {
      console.log("Payment not completed:", session.id);
      res.status(400).json({ status: "FAILED", message: "Le paiement n'a pas été effectué." });
    }
  } catch (error) {
    console.error("Payment completion error:", error);
    res.status(500).json({ status: "FAILED", message: error.message });
  }
}

// Cancel Payment
async function cancelPayment(req, res) {
  console.log("Payment cancelled");
  res.json({ status: "CANCELLED", message: "Payment cancelled" });
}

// Add a Lesson to a Course
// Add a Lesson to a Course
async function addLesson(req, res) {
  upload(req, res, async (err) => {
    if (err) {
      console.error("Multer error in addLesson:", err);
      return res.status(400).json({ status: "FAILED", message: `File upload error: ${err.message}` });
    }

    const { courseId, title, videoUrl, duration, isLocked, order } = req.body;
    const thumbnail = req.file ? `/Uploads/${req.file.filename}` : "/Uploads/default.jpg";

    // Validate required fields
    if (!courseId || !title || !order) {
      console.log("Missing required fields in addLesson:", { courseId, title, order });
      return res.status(400).json({ status: "FAILED", message: "Required fields (courseId, title, order) are missing!" });
    }

    // Validate courseId format
    if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log("Invalid courseId format:", courseId);
      return res.status(400).json({ status: "FAILED", message: "Invalid Course ID format" });
    }

    try {
      // Check if the course exists
      const course = await Course.findById(courseId);
      if (!course) {
        console.log("Course not found:", courseId);
        return res.status(404).json({ status: "FAILED", message: "Course not found" });
      }

      // Generate summary for YouTube videos
      let summary = "";
      if (videoUrl && (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be"))) {
        console.log("Generating video summary for:", videoUrl);
        try {
          summary = await generateVideoSummary(videoUrl);
        } catch (summaryError) {
          console.warn("Failed to generate summary:", summaryError.message);
          summary = `Summary unavailable: ${summaryError.message}`;
        }
      } else if (videoUrl) {
        console.log("Non-YouTube video URL provided, skipping summary:", videoUrl);
        summary = "Summary unavailable: Non-YouTube video URL";
      }

      // Parse and validate inputs
      const parsedOrder = parseInt(order);
      if (isNaN(parsedOrder) || parsedOrder < 0) {
        console.log("Invalid order value:", order);
        return res.status(400).json({ status: "FAILED", message: "Order must be a non-negative number" });
      }

      const parsedIsLocked = isLocked !== undefined ? isLocked === "true" || isLocked === true : true;

      // Create new lesson
      const newLesson = new Lesson({
        courseId,
        title: title.trim(),
        videoUrl: videoUrl ? videoUrl.trim() : "",
        duration: duration ? duration.trim() : "00:00",
        isLocked: parsedIsLocked,
        order: parsedOrder,
        thumbnail,
        summary,
      });

      const savedLesson = await newLesson.save();
      console.log("Lesson added successfully:", savedLesson._id);
      res.json({ status: "SUCCESS", message: "Lesson added successfully", data: savedLesson });
    } catch (error) {
      console.error("Error adding lesson:", error);
      res.status(500).json({ status: "FAILED", message: `Failed to add lesson: ${error.message}` });
    }
  });
}
// Get All Lessons for a Course
async function getLessonsByCourseId(req, res) {
  try {
    const { courseId } = req.params;
    if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid Course ID format" });
    }
    const lessons = await Lesson.find({ courseId }).sort({ order: 1 });
    res.status(200).json(lessons);
  } catch (error) {
    console.error("Error fetching lessons:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get Country from IP
async function getCountryFromIP() {
  try {
    const apiKey = process.env.IPIFY_API_KEY;
    const url = `https://geo.ipify.org/api/v2/country?apiKey=${apiKey}`;
    const response = await axios.get(url);
    const data = response.data;
    return { ip: data.ip, country: data.location.country };
  } catch (error) {
    console.error("Error fetching IP location:", error.message);
    throw new Error("Failed to detect location");
  }
}

// Get Courses by Location
async function getCourseByLocation(req, res) {
  try {
    const locationData = await getCountryFromIP();
    const country = locationData.country;

    let courses;
    if (country === "TN") {
      courses = await Course.find({ language: "Arabic" });
    } else if (country === "US") {
      courses = await Course.find({ language: "English" });
    } else {
      courses = await Course.find({ language: "French" });
    }
    res.status(200).json(courses);
  } catch (err) {
    console.error("Error fetching courses by location:", err);
    res.status(500).json({ message: "Error detecting location or fetching courses", error: err.message });
  }
}

// Fetch Google Classroom Courses with YouTube Recommendations
const fetchClassroomCourses = async (req, res) => {
  try {
    console.log("fetchClassroomCourses: Request received", {
      sessionId: req.sessionID,
      userId: req.session.userId,
      isAuthenticated: req.isAuthenticated(),
    });

    if (!req.isAuthenticated() || !req.session.userId) {
      console.log("fetchClassroomCourses: No authenticated session");
      return res.status(401).json({ status: "FAILED", message: "Not authenticated. Please log in." });
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      console.log("fetchClassroomCourses: User not found", { userId: req.session.userId });
      return res.status(404).json({ status: "FAILED", message: "User not found." });
    }

    if (!user.googleAccessToken) {
      console.log("fetchClassroomCourses: No Google access token", { userId: user._id });
      return res.status(403).json({ status: "FAILED", message: "No Google access token found. Please re-authenticate with Google." });
    }

    console.log("fetchClassroomCourses: User authenticated", {
      userId: user._id,
      email: user.email,
    });

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL
    );
    oauth2Client.setCredentials({ access_token: user.googleAccessToken });

    const classroom = google.classroom({ version: "v1", auth: oauth2Client });
    let response;
    try {
      console.log("fetchClassroomCourses: Fetching Google Classroom courses");
      response = await classroom.courses.list({ pageSize: 100 });
    } catch (apiError) {
      console.error("fetchClassroomCourses: Classroom API error", apiError);
      if (apiError.code === 401 && user.googleRefreshToken) {
        console.log("fetchClassroomCourses: Attempting to refresh Google access token");
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          user.googleAccessToken = credentials.access_token;
          await user.save();
          console.log("fetchClassroomCourses: Access token refreshed");
          oauth2Client.setCredentials({ access_token: user.googleAccessToken });
          response = await classroom.courses.list({ pageSize: 100 });
        } catch (refreshError) {
          console.error("fetchClassroomCourses: Failed to refresh token", refreshError);
          return res.status(401).json({ status: "FAILED", message: "Google token refresh failed. Please re-authenticate." });
        }
      } else {
        throw apiError;
      }
    }

    const courses = response.data.courses || [];
    console.log("fetchClassroomCourses: Courses fetched", { courseCount: courses.length });

    const youtube = google.youtube({ version: "v3", auth: process.env.YOUTUBE_API_KEY });
    const courseList = await Promise.all(
      courses.map(async (course) => {
        let recommendations = [];
        try {
          const youtubeResponse = await youtube.search.list({
            part: "snippet",
            q: `${course.name}`,
            maxResults: 3,
            type: "video",
          });
          recommendations = youtubeResponse.data.items.map((item) => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            embedUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
          }));
        } catch (youtubeError) {
          console.error("fetchClassroomCourses: YouTube API error", youtubeError);
        }
        return {
          id: course.id,
          name: course.name,
          section: course.section,
          description: course.descriptionHeading || "No description",
          state: course.courseState,
          recommendations,
        };
      })
    );

    res.json({ status: "SUCCESS", message: "Courses fetched successfully", courses: courseList });
  } catch (error) {
    console.error("fetchClassroomCourses: General error", error);
    res.status(500).json({ status: "FAILED", message: `Error fetching courses: ${error.message}` });
  }
};

// Regenerate Summary for a Lesson
async function regenerateLessonSummary(req, res) {
  try {
    const { lessonId } = req.params;
    if (!lessonId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid Lesson ID format" });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    if (!lesson.videoUrl || (!lesson.videoUrl.includes("youtube.com") && !lesson.videoUrl.includes("youtu.be"))) {
      return res.status(400).json({ error: "Lesson does not have a valid YouTube video URL" });
    }

    const summary = await generateVideoSummary(lesson.videoUrl);
    lesson.summary = summary;
    await lesson.save();

    console.log("Lesson summary regenerated:", lesson._id);
    res.json({ status: "SUCCESS", message: "Summary regenerated successfully", data: lesson });
  } catch (error) {
    console.error("Error regenerating summary:", error);
    res.status(500).json({ error: `Failed to regenerate summary: ${error.message}` });
  }
}

// Backfill Summaries for Existing Lessons
async function backfillLessonSummaries(req, res) {
  try {
    const lessons = await Lesson.find({ videoUrl: { $exists: true, $ne: "" } });
    const updatedLessons = [];

    for (const lesson of lessons) {
      if (lesson.videoUrl && (lesson.videoUrl.includes("youtube.com") || lesson.videoUrl.includes("youtu.be"))) {
        if (!lesson.summary || lesson.summary.includes("Failed to generate summary") || lesson.summary.includes("Summary unavailable")) {
          console.log(`Generating summary for lesson: ${lesson.title}`);
          const summary = await generateVideoSummary(lesson.videoUrl);
          lesson.summary = summary;
          await lesson.save();
          updatedLessons.push(lesson);
        }
      }
    }

    console.log(`Backfilled summaries for ${updatedLessons.length} lessons`);
    res.json({
      status: "SUCCESS",
      message: `Updated summaries for ${updatedLessons.length} lessons`,
      data: updatedLessons,
    });
  } catch (error) {
    console.error("Error backfilling summaries:", error);
    res.status(500).json({ error: `Failed to backfill summaries: ${error.message}` });
  }
}

// Set Manual Summary for a Lesson
async function setManualSummary(req, res) {
  try {
    const { lessonId, summary } = req.body;
    if (!lessonId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid Lesson ID format" });
    }
    if (!summary || typeof summary !== "string") {
      return res.status(400).json({ error: "Summary is required and must be a string" });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    lesson.summary = summary;
    await lesson.save();
    console.log("Manual summary set for lesson:", lesson._id);
    res.json({ status: "SUCCESS", message: "Summary updated successfully", data: lesson });
  } catch (error) {
    console.error("Error setting manual summary:", error);
    res.status(500).json({ error: `Failed to set manual summary: ${error.message}` });
  }
}

// Generate PDF Summary for a Lesson
async function generateSummaryPDF(req, res) {
  try {
    const { lessonId } = req.params;
    if (!lessonId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid Lesson ID format" });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    const doc = new PDFDocument({ margin: 50 });
    const fileName = `Lesson_Summary_${lesson.title.replace(/\s+/g, "_")}.pdf`;

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Type", "application/pdf");

    doc.pipe(res);

    doc.fontSize(20).text("Lesson Summary", { align: "center" });
    doc.moveDown();

    doc.fontSize(16).text("Title:", { continued: true }).fontSize(14).text(` ${lesson.title}`);
    doc.moveDown(0.5);

    doc.fontSize(16).text("Video URL:", { continued: true }).fontSize(14).text(` ${lesson.videoUrl || "Not available"}`);
    doc.moveDown(0.5);

    doc.fontSize(16).text("Summary:");
    doc.moveDown(0.5);
    doc.fontSize(12).text(lesson.summary || "No summary available", { align: "left", indent: 20 });

    doc.end();
    console.log("PDF summary generated for lesson:", lesson._id);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ error: `Failed to generate PDF: ${error.message}` });
  }
}

// Generate AI Tutor Video for a Course
async function generateAITutorVideo(req, res) {
  try {
    const { courseId, script, source_url, voiceId } = req.body;
    if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid Course ID format" });
    }
    if (!script) {
      return res.status(400).json({ error: "Script is required for AI tutor video" });
    }
    if (!source_url) {
      return res.status(400).json({ error: "Image URL (source_url) is required for AI tutor video" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    console.log("Generating AI tutor video for course:", courseId);
    const videoData = await generateTutorVideo({ script, source_url, voiceId });
    course.aiTutorVideo = videoData.videoUrl;
    await course.save();

    res.json({
      status: "SUCCESS",
      message: "AI tutor video generated successfully",
      data: { course, videoData },
    });
  } catch (error) {
    console.error("Error generating AI tutor video:", error);
    res.status(500).json({ error: `Failed to generate AI tutor video: ${error.message}` });
  }
}

// Check AI Tutor Video Status
async function checkAITutorVideoStatus(req, res) {
  try {
    const { videoId } = req.params;
    if (!videoId) {
      return res.status(400).json({ error: "Video ID is required" });
    }

    console.log("Checking AI tutor video status:", videoId);
    const videoStatus = await getTutorVideoStatus(videoId);
    res.json({
      status: "SUCCESS",
      message: "Video status retrieved successfully",
      data: videoStatus,
    });
  } catch (error) {
    console.error("Error checking video status:", error);
    res.status(500).json({ error: `Failed to check video status: ${error.message}` });
  }
}

module.exports = {
  add,
  getAll,
  getByInstructor,
  getCoursesByRole,
  getById,
  update,
  deleteCourse,
  createCheckout,
  completePayment,
  cancelPayment,
  addLesson,
  getLessonsByCourseId,
  getCourseByLocation,
  fetchClassroomCourses,
  regenerateLessonSummary,
  backfillLessonSummaries,
  setManualSummary,
  generateSummaryPDF,
  generateAITutorVideo,
  checkAITutorVideoStatus,
};