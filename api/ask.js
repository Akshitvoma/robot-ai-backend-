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

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: question
            }
          ]
        }
      ]
    });

    const answer = response.text;

    return res.status(200).json({
      answer: answer
    });

  } catch (error) {
    console.error("Gemini error:", error);

    return res.status(500).json({
      error: "AI request failed",
      details: error.message
    });
  }
}