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
  header.writeUInt16LE(1, 20);      // PCM
  header.writeUInt16LE(1, 22);      // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return header;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only"
    });
  }

  try {
    // Receive microphone WAV from ESP32
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const inputAudio = Buffer.concat(chunks);

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

    const inputBase64 = inputAudio.toString("base64");

    // Ask Gemini to understand the question
    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",

      input: [
        {
          type: "text",
          text:
            "The attached WAV contains a person speaking a question. " +
            "Understand exactly what the person said. " +
            "Do not invent a different question. " +
            "Answer the question that was actually spoken. " +
            "If unclear, say: I couldn't understand that. " +
            "Keep the answer short because it will be spoken aloud."
        },
        {
          type: "audio",
          data: inputBase64,
          mime_type: "audio/wav"
        }
      ]
    });

    const answer = interaction.output_text;

    console.log("Gemini answer:", answer);

    // Generate speech
    const ttsResponse = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",

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
      ttsResponse.candidates?.[0]?.content?.parts || [];

    let audioBase64 = null;

    for (const part of parts) {
      if (part.inlineData?.data) {
        audioBase64 = part.inlineData.data;
        break;
      }
    }

    if (!audioBase64) {
      throw new Error("TTS returned no audio");
    }

    // Gemini TTS returns raw 16-bit PCM audio.
    const pcmAudio = Buffer.from(audioBase64, "base64");

    // Gemini TTS audio is 24 kHz mono PCM.
    const wavHeader = createWavHeader(
      pcmAudio.length,
      24000
    );

    const wavAudio = Buffer.concat([
      wavHeader,
      pcmAudio
    ]);

    // Send WAV directly to ESP32
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
      "X-Answer",
      encodeURIComponent(answer)
    );

    return res.send(wavAudio);

  } catch (error) {

    console.error("Gemini error:", error);

    return res.status(500).json({
      error: "AI request failed",
      details: error.message
    });
  }
}