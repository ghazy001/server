const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const LessonSchema = new Schema({
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true },
    videoUrl: { type: String },
    duration: { type: String },
    isLocked: { type: Boolean, default: true },
    order: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
    summary: { type: String, default: "" }, // New field for video summary
});

module.exports = mongoose.model("Lesson", LessonSchema);