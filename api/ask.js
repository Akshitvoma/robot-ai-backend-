import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only"
    });
  }

  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: question
    });

    return res.status(200).json({
      answer: interaction.output_text
    });

  } catch (error) {
    console.error("Gemini error:", error);

    return res.status(500).json({
      error: "AI request failed",
      details: error.message
    });
  }
}