const express=require('express')
const router=express.Router()
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config()
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

router.get('/textAi', async (req, res) => {
    try {
      const prompt = req.query?.prompt;

      if (!prompt) {
        return res.status(400).json({ message: "Please provide a prompt in query" });
      }

      const result = await model.generateContent(prompt);
      const response = await result.response.text();

      console.log("AI Response:", response);
      res.json({ answer: response });
    } catch (error) {
      console.error("AI API Error:", error);
      res.status(500).json({ message: "AI integration failed", error: error.message });
    }
  });

  module.exports=router



