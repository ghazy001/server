const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  id: Number,
  thumb: String,
  date: String,
  title: String,
  location: String,
  page: String,
  author: {
    name: String
  },
  category: String,
  rating: Number,
  studentCount: Number,
  description: String, // ← Remplace overview, learn, highlights, extraText
  image2: String
});

module.exports = mongoose.model("Event", eventSchema);
