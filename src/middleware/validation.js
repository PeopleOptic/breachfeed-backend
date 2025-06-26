function validateRequest(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.details.map(d => d.message) 
      });
    }
    
    // Apply validated and defaulted values back to req.body
    req.body = value;
    
    next();
  };
}

module.exports = {
  validateRequest
};