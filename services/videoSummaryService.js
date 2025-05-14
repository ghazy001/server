const { getSubtitles } = require("youtube-caption-extractor");
require("dotenv").config();

async function summarizeText(text) {
    // Split text into sentences for better summarization
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let summary = "";
    let currentLength = 0;
    const maxLength = 20000; // Increased from 200 to 500 characters

    // Add sentences until maxLength is reached
    for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (currentLength + trimmedSentence.length <= maxLength) {
            summary += trimmedSentence + " ";
            currentLength += trimmedSentence.length + 1;
        } else {
            break;
        }
    }

    // Trim and add ellipsis if necessary
    summary = summary.trim();
    if (text.length > maxLength) {
        summary = summary.slice(0, maxLength - 3) + "...";
    }

    return summary || "No summary available.";
}

async function generateVideoSummary(videoUrl) {
    try {
        if (!videoUrl || (!videoUrl.includes("youtube.com") && !videoUrl.includes("youtu.be"))) {
            throw new Error("Invalid or missing YouTube URL");
        }

        console.log(`Attempting transcription for: ${videoUrl}`);

        let videoId;
        try {
            if (videoUrl.includes("youtube.com")) {
                videoId = new URLSearchParams(new URL(videoUrl).search).get("v");
            } else if (videoUrl.includes("youtu.be")) {
                videoId = videoUrl.split("youtu.be/")[1]?.split("?")[0];
            }
            if (!videoId) throw new Error("Could not extract YouTube video ID");
            console.log(`Extracted video ID: ${videoId}`);
        } catch (error) {
            throw new Error(`Invalid YouTube URL: ${error.message}`);
        }

        try {
            const subtitles = await getSubtitles({ videoID: videoId, lang: "en" });
            if (!subtitles || subtitles.length === 0) {
                throw new Error("No subtitles available for this video");
            }
            const fullText = subtitles.map((entry) => entry.text).join(" ");
            const summary = await summarizeText(fullText);
            console.log(`YouTube Caption Extractor summary: ${summary}`);
            return summary;
        } catch (ytError) {
            console.warn(`YouTube Caption Extractor failed: ${ytError.message}`);
            return "Summary unavailable: Video subtitles are disabled or not available.";
        }
    } catch (error) {
        console.error(`Error generating summary for ${videoUrl}:`, error.message);
        return `Summary unavailable: ${error.message}`;
    }
}

module.exports = { generateVideoSummary };