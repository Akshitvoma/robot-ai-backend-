import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

function createWavHeader(dataSize, sampleRate = 24000) {
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(dataSize + 36, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);

  // PCM
  header.writeUInt16LE(1, 20);

  // Mono
  header.writeUInt16LE(1, 22);

  header.writeUInt32LE(sampleRate, 24);

  // 16-bit mono
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return header;
}

async function generateSpeech(text) {

  console.log("Generating TTS for:", text);

  const response = await ai.models.generateContent({

    model: "gemini-3.1-flash-tts-preview",

    contents: [
      {
        parts: [
          {
            text: `Say naturally and clearly: ${text}`
          }
        ]
      }
    ],

    config: {

      responseModalities: ["AUDIO"],

      speechConfig: {

        voiceConfig: {

          prebuiltVoiceConfig: {
            voiceName: "Kore"
          }

        }

      }

    }

  });

  const parts =
    response.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {

    if (part.inlineData?.data) {

      console.log(
        "TTS audio received."
      );

      return Buffer.from(
        part.inlineData.data,
        "base64"
      );
    }
  }

  console.error(
    "TTS response contained no audio."
  );

  return null;
}

export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "POST only"
    });
  }

  try {

    // =========================================
    // Receive microphone WAV
    // =========================================

    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const inputAudio =
      Buffer.concat(chunks);

    if (!inputAudio.length) {

      return res.status(400).json({
        error: "No audio received"
      });
    }

    console.log(
      "Received microphone audio:",
      inputAudio.length,
      "bytes"
    );


    // =========================================
    // Convert microphone WAV to Base64
    // =========================================

    const inputBase64 =
      inputAudio.toString("base64");


    // =========================================
    // Ask Gemini
    // =========================================

    const interaction =
      await ai.interactions.create({

        model: "gemini-3.6-flash",

        input: [

          {
            type: "text",

            text:
              "The attached WAV contains a person speaking a question. " +
              "Understand exactly what the person said. " +
              "Do not invent a different question. " +
              "Answer the question that was actually spoken. " +
              "If the speech is unclear, say: I couldn't understand that. " +
              "Keep the answer short because it will be spoken aloud."
          },

          {
            type: "audio",

            data: inputBase64,

            mime_type: "audio/wav"
          }

        ]

      });


    const answer =
      interaction.output_text;


    if (!answer) {

      return res.status(500).json({
        error: "Gemini returned no answer"
      });
    }


    console.log(
      "Gemini answer:",
      answer
    );


    // =========================================
    // Generate TTS
    // =========================================

    let pcmAudio =
      await generateSpeech(answer);


    // =========================================
    // Retry once if TTS failed
    // =========================================

    if (!pcmAudio || pcmAudio.length < 1000) {

      console.log(
        "TTS audio was missing or too small."
      );

      console.log(
        "Retrying TTS..."
      );

      pcmAudio =
        await generateSpeech(answer);
    }


    // =========================================
    // Make sure we actually have audio
    // =========================================

    if (!pcmAudio || pcmAudio.length < 1000) {

      throw new Error(
        "Gemini TTS did not return valid audio."
      );
    }


    console.log(
      "TTS PCM bytes:",
      pcmAudio.length
    );


    // =========================================
    // Create WAV
    // =========================================

    const wavHeader =
      createWavHeader(
        pcmAudio.length,
        24000
      );


    const wavAudio =
      Buffer.concat([
        wavHeader,
        pcmAudio
      ]);


    console.log(
      "Final WAV bytes:",
      wavAudio.length
    );


    // =========================================
    // Return WAV
    // =========================================

    res.status(200);

    res.setHeader(
      "Content-Type",
      "audio/wav"
    );

    res.setHeader(
      "Content-Length",
      wavAudio.length
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );


    return res.send(wavAudio);

  }

  catch (error) {

    console.error(
      "BACKEND ERROR:",
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