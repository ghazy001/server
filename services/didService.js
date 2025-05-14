require("dotenv").config();
const axios = require("axios");

const DID_API_URL = "https://api.d-id.com";

async function validateApiKey() {
  try {
    if (!process.env.DID_API_KEY) {
      throw new Error("D-ID API key is missing in environment variables");
    }

    const base64Key = Buffer.from(process.env.DID_API_KEY).toString("base64");
    console.log("D-ID API Key (partial, Base64):", base64Key.slice(0, 4) + "...");

    const response = await axios.get(`${DID_API_URL}/talks`, {
      headers: {
        Authorization: `Basic ${base64Key}`, // Fixed: Use template literal
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    console.log("D-ID API key validation successful:", response.status);
    return true;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error("D-ID API key validation failed:", {
      status: error.response?.status,
      data: error.response?.data,
      message: errorMessage,
    });
    throw new Error(`API key validation failed: ${errorMessage}`);
  }
}

async function generateTutorVideo({ script, source_url, voiceId = "en-US-JennyNeural" }) {
  try {
    if (!script || !source_url) {
      throw new Error("Script and source_url are required for generating AI tutor video");
    }

    const urlPattern = /^(https?:\/\/[^\s/$.?#].[^\s]*\.(jpg|jpeg|png))$/i;
    if (!urlPattern.test(source_url)) {
      throw new Error("Invalid source_url. Must be a valid URL to a JPEG or PNG image.");
    }
    if (source_url.startsWith("data:")) {
      throw new Error("Base64 data URIs are not supported. Use a publicly accessible URL for the image.");
    }

    // Validate script length (arbitrary limit to prevent excessive credit usage)
    if (script.length > 1000) {
      throw new Error("Script is too long. Please use a script with 1000 characters or fewer.");
    }

    await validateApiKey();
    const base64Key = Buffer.from(process.env.DID_API_KEY).toString("base64");
    console.log("D-ID API Key (partial, Base64):", base64Key.slice(0, 4) + "...");

    const payload = {
      source_url,
      script: {
        type: "text",
        input: script,
        provider: {
          type: "microsoft",
          voice_id: voiceId,
          voice_config: {
            style: voiceId === "en-US-JennyNeural" ? "Cheerful" : "Neutral",
          },
        },
      },
      config: {
        stitch: false, // Disabled to minimize credit usage
      },
    };

    console.log("Sending request to D-ID /talks:", JSON.stringify(payload, null, 2));

    const response = await axios.post(`${DID_API_URL}/talks`, payload, {
      headers: {
        Authorization: `Basic ${base64Key}`, // Fixed: Use template literal
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    console.log("D-ID /talks response:", JSON.stringify(response.data, null, 2));

    return {
      videoUrl: response.data.result_url || "",
      videoId: response.data.id,
      status: response.data.status,
    };
  } catch (error) {
    const errorMessage = error.response?.data?.description || error.response?.data?.message || error.message;
    console.error("D-ID video generation error:", {
      status: error.response?.status,
      data: error.response?.data,
      message: errorMessage,
      requestPayload: { script, source_url, voiceId },
      suggestion: error.response?.status === 402 
        ? "Check your credit balance in the D-ID dashboard at https://studio.d-id.com/ and add credits if needed."
        : "Verify request parameters and API key permissions.",
    });
    if (error.response?.status === 402) {
      throw new Error("Failed to generate AI tutor video: Insufficient credits. Please add credits in your D-ID account at https://studio.d-id.com/.");
    }
    throw new Error(`Failed to generate AI tutor video: ${errorMessage}`);
  }
}

async function getTutorVideoStatus(videoId) {
  try {
    await validateApiKey();
    const base64Key = Buffer.from(process.env.DID_API_KEY).toString("base64");

    const response = await axios.get(`${DID_API_URL}/talks/${videoId}`, {
      headers: {
        Authorization: `Basic ${base64Key}`, // Fixed: Use template literal
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    console.log("D-ID /talks status response:", JSON.stringify(response.data, null, 2));

    return {
      status: response.data.status,
      videoUrl: response.data.result_url || "",
    };
  } catch (error) {
    const errorMessage = error.response?.data?.description || error.response?.data?.message || error.message;
    console.error("D-ID video status check error:", {
      status: error.response?.status,
      data: error.response?.data,
      message: errorMessage,
    });
    throw new Error(`Failed to check video status: ${errorMessage}`);
  }
}

module.exports = { generateTutorVideo, getTutorVideoStatus };