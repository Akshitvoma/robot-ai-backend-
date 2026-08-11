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

    // ========================================
    // Receive WAV audio from ESP32
    // ========================================

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


    // ========================================
    // Convert WAV to Base64
    // ========================================

    const audioBase64 =
      audioBuffer.toString("base64");


    // ========================================
    // Ask Gemini
    // ========================================

    const interaction =
      await ai.interactions.create({

        model: "gemini-3.6-flash",

        input: [

          {
            type: "text",

            text:
              "The attached WAV contains a person speaking a question. " +
              "First understand exactly what the person said. " +
              "Do not invent a different question. " +
              "Answer the question that was actually spoken. " +
              "If the speech is unclear, say 'I couldn't understand that.' " +
              "Keep the answer short because it will be spoken aloud."
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


    console.log(
      "Gemini answer:",
      answer
    );


    // ========================================
    // Generate speech
    // ========================================

    const ttsResponse =
      await ai.models.generateContent({

        model:
          "gemini-3.1-flash-tts-preview",

        contents: [

          {
            role: "user",

            parts: [

              {
                text: answer
              }

            ]
          }

        ],

        config: {

          responseModalities: [
            "AUDIO"
          ],

          speechConfig: {

            voiceConfig: {

              prebuiltVoiceConfig: {

                voiceName: "Kore"

              }

            }

          }

        }

      });


    // ========================================
    // Find audio data
    // ========================================

    const parts =
      ttsResponse.candidates?.[0]?.content?.parts || [];

    let audioData = null;

    for (const part of parts) {

      if (part.inlineData) {

        audioData =
          part.inlineData.data;

        break;
      }
    }


    if (!audioData) {

      throw new Error(
        "TTS returned no audio"
      );

    }


    // ========================================
    // Return answer + audio
    // ========================================

    return res.status(200).json({

      answer: answer,

      audio: audioData

    });

  }

  catch (error) {

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