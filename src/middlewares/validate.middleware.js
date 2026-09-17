const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({
      status: 400,
      message: "فشل التحقق من البيانات",
      errors: error.details.map((d) => d.message),
    });
  }
  next();
};

export default validate;