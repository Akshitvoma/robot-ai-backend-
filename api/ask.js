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

    console.log(
      "Received audio:",
      audioBuffer.length,
      "bytes"
    );

    const audioBase64 =
      audioBuffer.toString("base64");

    const interaction =
      await ai.interactions.create({

        model: "gemini-3.6-flash",

        input: [

          {
            type: "text",

            text:
              "The attached WAV contains a person speaking a question. " +
              "First carefully determine exactly what the person said. " +
              "Do not invent or guess a different question. " +
              "Then answer the question that was actually spoken. " +
              "If the speech is unclear, say: 'I couldn't understand that.' " +
              "Keep the answer short and clear."
          },

          {
            type: "audio",

            data: audioBase64,

            mime_type: "audio/wav"
          }

        ]
      });


    const answer =
      interaction.output_text;


    return res.status(200).json({

      answer: answer

    });


  } catch (error) {

    console.error(
      "Gemini error:",
      error
    );


    return res.status(500).json({

      error:
        "AI request failed",

      details:
        error.message

    });

  }

}