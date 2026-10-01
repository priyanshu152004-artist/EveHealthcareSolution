const { Router } = require('express');
const schemas = require('../schemas');
const { validate } = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const centres = require('../services/centres');

const router = Router();
const admin = [authenticate, requireAdmin];

// ---- test catalogue
router.get('/tests', validate({ query: schemas.testList }), async (req, res) => {
  res.json(await centres.listTests(req.valid.query));
});

router.post('/tests', admin, validate({ body: schemas.testCreate }), async (req, res) => {
  res.status(201).json(await centres.createTest(req.valid.body));
});

// ---- centres
router.get('/centres', validate({ query: schemas.centreList }), async (req, res) => {
  res.json(await centres.listCentres(req.valid.query));
});

router.post('/centres', admin, validate({ body: schemas.centreCreate }), async (req, res) => {
  res.status(201).json(await centres.createCentre(req.valid.body));
});

router.get('/centres/:id', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await centres.getCentre(req.valid.params.id));
});

router.patch(
  '/centres/:id',
  admin,
  validate({ params: schemas.idParams, body: schemas.centreUpdate }),
  async (req, res) => {
    res.json(await centres.updateCentre(req.valid.params.id, req.valid.body));
  },
);

router.get('/centres/:id/tests', validate({ params: schemas.idParams }), async (req, res) => {
  const centre = await centres.getCentre(req.valid.params.id);
  res.json(centre.offerings);
});

router.put(
  '/centres/:id/tests',
  admin,
  validate({ params: schemas.idParams, body: schemas.offeringUpsert }),
  async (req, res) => {
    res.json(await centres.upsertOffering(req.valid.params.id, req.valid.body));
  },
);

module.exports = router;
