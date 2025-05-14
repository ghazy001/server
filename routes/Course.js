const express = require("express");
const CourseController = require("../controller/CourseController");
const { isAuthenticated } = require("../middleware/auth");

const router = express.Router();
router.use(express.json());

// CRUD Routes
router.post("/add", isAuthenticated, CourseController.add);
router.get("/getAll", CourseController.getAll);
router.get("/getByInstructor", isAuthenticated, CourseController.getByInstructor);
router.get("/getCoursesByRole", CourseController.getCoursesByRole);
router.get("/getCourse/:id", CourseController.getById);
router.put("/update/:id", CourseController.update);
router.delete("/delete/:id", CourseController.deleteCourse);

// Checkout Routes
router.post("/checkout", CourseController.createCheckout);
router.get("/complete", CourseController.completePayment);
router.get("/cancel", CourseController.cancelPayment);

// IP Detector
router.get("/courses-by-location", CourseController.getCourseByLocation);
// Classroom
router.get("/classroom/courses", CourseController.fetchClassroomCourses);

// Lesson Routes
router.post("/addLesson", CourseController.addLesson);
router.get("/getLessons/:courseId", CourseController.getLessonsByCourseId);

// Summary Routes
router.post("/regenerateSummary/:lessonId", CourseController.regenerateLessonSummary);
router.post("/backfillSummaries", CourseController.backfillLessonSummaries);
router.post("/setManualSummary", CourseController.setManualSummary);
router.get("/generateSummaryPDF/:lessonId", CourseController.generateSummaryPDF);

// AI Tutor Video Routes
router.post("/generateAITutorVideo", CourseController.generateAITutorVideo);
router.get("/checkAITutorVideoStatus/:videoId", CourseController.checkAITutorVideoStatus);

module.exports = router;