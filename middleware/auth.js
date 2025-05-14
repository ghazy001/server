const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  res.status(401).json({ status: "FAILED", message: "Not authenticated" });
};

module.exports = { isAuthenticated };