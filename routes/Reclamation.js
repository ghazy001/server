const express = require('express');
const router = express.Router();
const {
  createReclamation,
  getAllReclamations,
  updateReclamationStatus
} = require('../controller/ReclamationController');

// POST /reclamations
router.post('/', createReclamation);

// GET /reclamations
router.get('/', getAllReclamations);

// PATCH /reclamations/:id
router.patch('/:id', updateReclamationStatus);

module.exports = router;
