const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ message: 'Access denied: No role assigned' });
    }
    
    if (allowedRoles.includes(req.user.role)) {
      next();
    } else {
      return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
    }
  };
};

module.exports = checkRole;
