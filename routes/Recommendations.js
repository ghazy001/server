const express = require("express");
const router = express.Router();
const {getRecommendations
 
} = require("../controller/RecommendationsController"); // Adjust the path as necessary

router.use(express.json());

router.post("/", getRecommendations);


module.exports = router;