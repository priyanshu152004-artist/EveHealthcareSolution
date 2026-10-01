/**
 * Validate (and coerce) parts of the request with zod schemas. Parsed values
 * land on req.valid.{body,query,params}; handlers never read raw input.
 * A ZodError is turned into a 422 by the error handler.
 */
function validate(schemas) {
  return (req, res, next) => {
    req.valid = req.valid || {};
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {});
    }
    next();
  };
}

module.exports = { validate };
