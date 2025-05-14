const { AssemblyAI } = require("assemblyai");
const { getSubtitles } = require("youtube-caption-extractor");
require("dotenv").config();

const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY,
});

async function testTranscription() {
    const videoUrl = "https://www.youtube.com/watch?v=w09b30BI0lk";
    console.log(`Testing transcription for: ${videoUrl}`);

    // Extract video ID
    const videoId = new URLSearchParams(new URL(videoUrl).search).get("v");
    console.log(`Video ID: ${videoId}`);

    // Test AssemblyAI
    console.log("\nTesting AssemblyAI...");
    try {
        const transcript = await client.transcripts.transcribe({
            audio: videoUrl,
            auto_chapters: true,
        });
        console.log(`Transcription ID: ${transcript.id}, Status: ${transcript.status}`);

        let result = transcript;
        const maxAttempts = 60;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            result = await client.transcripts.get(transcript.id);
            console.log(`Attempt ${i + 1}, Status: ${result.status}`);
            if (result.status === "completed") break;
            if (result.status === "error") throw new Error(result.error || "Transcription failed");
        }

        if (result.status === "completed") {
            const summary = result.chapters?.length
                ? result.chapters.map((chapter) => chapter.gist).join(" ")
                : result.text?.slice(0, 200) || "Unable to generate summary.";
            console.log("AssemblyAI Summary:", summary);
        } else {
            console.log("AssemblyAI timed out");
        }
    } catch (error) {
        console.error("AssemblyAI failed:", error.message);
    }

    // Test YouTube Caption Extractor
    console.log("\nTesting YouTube Caption Extractor...");
    try {
        const subtitles = await getSubtitles({ videoID: videoId, lang: "en" });
        if (!subtitles || subtitles.length === 0) {
            throw new Error("No subtitles available for this video");
        }
        const fullText = subtitles.map((entry) => entry.text).join(" ");
        const summary = fullText.slice(0, 200) + (fullText.length > 200 ? "..." : "");
        console.log("YouTube Caption Extractor Summary:", summary);
    } catch (error) {
        console.error("YouTube Caption Extractor failed:", error.message);
    }
}

testTranscription();