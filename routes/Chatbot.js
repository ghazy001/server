const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // System instruction to restrict the chatbot to IT domain
    const systemInstruction = `You are an IT domain expert chatbot. You can only answer questions related to Information Technology, including programming, software development, cybersecurity, networking, cloud computing, databases, IT infrastructure, and related technical topics. If a question is unrelated to IT, politely inform the user that you can only assist with IT-related queries and suggest they ask an IT-related question. Provide accurate and helpful responses for IT-related questions.`;

    // Combine system instruction with user message
    const prompt = `${systemInstruction}\n\nUser: ${message}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.candidates[0].content.parts[0].text;
    res.json({ reply: text });
  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;