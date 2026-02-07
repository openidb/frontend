import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice transcription is not configured" },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  const audio = formData.get("audio");
  if (!audio || !(audio instanceof File)) {
    return NextResponse.json(
      { error: "Missing audio file" },
      { status: 400 }
    );
  }

  if (audio.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Audio file too large (max 25MB)" },
      { status: 400 }
    );
  }

  // Read the file bytes and re-create as a proper Blob for forwarding
  const bytes = await audio.arrayBuffer();
  const blob = new Blob([bytes], { type: audio.type || "audio/webm" });
  const fileName = audio.name || "recording.webm";

  const groqForm = new FormData();
  groqForm.append("file", blob, fileName);
  groqForm.append("model", "whisper-large-v3");
  groqForm.append("response_format", "json");
  groqForm.append("temperature", "0");

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: groqForm,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API error:", response.status, errorText);
      return NextResponse.json(
        { error: "Transcription service failed" },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({ text: data.text || "" });
  } catch (err) {
    console.error("Transcription error:", err);
    return NextResponse.json(
      { error: "Transcription service unavailable" },
      { status: 502 }
    );
  }
}
