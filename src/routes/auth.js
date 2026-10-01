const { Router } = require('express');
const schemas = require('../schemas');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/rateLimit');
const authService = require('../services/auth');

const router = Router();

router.post('/signup', authRateLimiter, validate({ body: schemas.signup }), async (req, res) => {
  res.status(201).json(await authService.signup(req.valid.body));
});

router.post('/login', authRateLimiter, validate({ body: schemas.login }), async (req, res) => {
  res.json(await authService.login(req.valid.body));
});

router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

module.exports = router;
