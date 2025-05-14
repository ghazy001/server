const nodemailer = require('nodemailer');
const Reclamation = require('../models/Reclamation');
require('dotenv').config();  // Charger les variables d'environnement

// Configurer le transporteur Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',  // Utiliser le service Gmail
  auth: {
    user: process.env.EMAIL_USER, // Utilisation de la variable d'environnement pour l'email
    pass: process.env.EMAIL_PASS, // Utilisation de la variable d'environnement pour le mot de passe
  },
});

// Fonction pour envoyer un email à l'utilisateur
const sendEmailToUser = (email, reclamationId) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Your claim (ID: ${reclamationId}) has been resolved`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #2c3e50;">Hello,</h2>
        
        <p>We are pleased to inform you that your claim (ID: <strong>${reclamationId}</strong>) has been successfully processed and resolved.</p>
        
        <p>If you have any further questions or concerns, please do not hesitate to contact us by replying to this email. We are here to assist you.</p>
        
        <p>Thank you for your patience and understanding.</p>
        
        <p>Kind regards,</p>
        <p style="font-weight: bold;">Customer Support Team</p>
        
        <footer style="margin-top: 20px; font-size: 0.8em; color: #7f8c8d;">
          <p>For more information, feel free to visit our website or reach us at the following contact details.</p>
        </footer>
      </div>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Erreur lors de l\'envoi de l\'email:', error);
    } else {
      console.log('E-mail envoyé:', info.response);
    }
  });


  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Erreur lors de l\'envoi de l\'email:', error);
    } else {
      console.log('E-mail envoyé:', info.response);
    }
  });
};

// Créer une réclamation
exports.createReclamation = async (req, res) => {
  try {
    const reclamation = await Reclamation.create(req.body);
    res.status(201).json(reclamation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Récupérer toutes les réclamations
exports.getAllReclamations = async (req, res) => {
  try {
    const reclamations = await Reclamation.find().sort({ createdAt: -1 });
    res.json(reclamations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mettre à jour le statut et envoyer un email
exports.updateReclamationStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'in_progress', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }

  try {
    const updated = await Reclamation.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Réclamation non trouvée' });
    }

    // Si la réclamation a été mise à jour, envoie un email à l'utilisateur
    sendEmailToUser(updated.email, updated._id, updated.status);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
