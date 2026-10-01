const fs = require('fs');
const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const { requestContextMiddleware } = require('./middleware/requestContext');
const { errorHandler } = require('./middleware/errorHandler');
const { NotFound } = require('./errors');

const openapi = YAML.parse(fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Express 5 routing is strict about trailing slashes by default; accept both
  // "/payments" and "/payments/" (the assignment uses the latter).
  app.set('strict routing', false);

  app.use(requestContextMiddleware);
  // Keep the raw bytes: the webhook signature is computed over them.
  app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { req.rawBody = buf; } }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/openapi.json', (req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  app.use('/auth', require('./routes/auth'));
  app.use('/', require('./routes/centres'));
  app.use('/bookings', require('./routes/bookings'));
  app.use('/payments', require('./routes/payments').router);

  app.use(() => {
    throw NotFound('Route not found');
  });
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
