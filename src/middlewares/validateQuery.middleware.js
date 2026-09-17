const validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true, // يحول "true"/"false"/"123" من الـ query string للنوع الصح
  });
  if (error) {
    return res.status(400).json({
      status: 400,
      message: "Validation failed",
      errors: error.details.map((d) => d.message),
    });
  }
  req.query = value;
  next();
};

export default validateQuery;