import AppError from '../utils/AppError.js';

function validate(schemas) {
  return (req, _res, next) => {
    for (const key of ['body', 'params', 'query']) {
      if (!schemas[key]) {
        continue;
      }

      const result = schemas[key].safeParse(req[key]);
      if (!result.success) {
        const message = result.error.issues
          .map(issue => `${issue.path.join('.') || key}: ${issue.message}`)
          .join('; ');
        return next(new AppError(400, message));
      }

      req.validated ??= {};
      req.validated[key] = result.data;
    }

    return next();
  };
}

export default validate;
