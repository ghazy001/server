const mongoose = require('mongoose');

const reclamationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    match: [/.+\@.+\..+/, 'Format d\'email invalide'],
  },
  comment: {
    type: String,
    required: [true, 'Le commentaire est requis'],
    minlength: [5, 'Le commentaire doit contenir au moins 5 caractères'],
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('Reclamation', reclamationSchema);
