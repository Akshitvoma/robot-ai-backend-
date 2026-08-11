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
    // Receive raw WAV data
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const audioBuffer = Buffer.concat(chunks);

    if (!audioBuffer.length) {
      return res.status(400).json({
        error: "No audio received"
      });
    }

    console.log("Received audio:", audioBuffer.length, "bytes");

    // Convert WAV binary to Base64
    const audioBase64 = audioBuffer.toString("base64");

    // Send audio to Gemini
    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",

      input: [
        {
          type: "text",
          text: "Listen to this audio. Understand the user's question and answer it clearly and briefly."
        },
        {
          type: "audio",
          data: audioBase64,
          mime_type: "audio/wav"
        }
      ]
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