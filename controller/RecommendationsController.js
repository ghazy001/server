const express = require('express');
const router = express.Router();
const axios = require('axios');

async function getRecommendations(req, res) {
    try {
        console.log('Request received at /recommend');
        const { languages } = req.body;  // Expecting an array of languages
        console.log('Languages received:', languages);

        if (!languages || !Array.isArray(languages) || languages.length === 0) {
            return res.status(400).json({ message: "Languages array is required." });
        }

        // Send list of languages to Flask API
        const response = await axios.post('http://localhost:5000/recommend', {
            language: languages[0],  // Assuming you want to send only the first language
            languages: languages.map(lang => lang.toLowerCase())
        });

        console.log('Response from Flask:', response.data);

        res.status(200).json({
            status: "SUCCESS",
            message: "Recommendations retrieved successfully",
            data: response.data
        });

    } catch (err) {
        console.error('Error in /recommend route:', err.message);
        res.status(500).json({
            status: "FAILED",
            message: err.message
        });
    }
}

module.exports = { getRecommendations };
