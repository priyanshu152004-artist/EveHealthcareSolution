CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,            -- stored lower-cased
  full_name     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diagnostic_centres (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT NOT NULL,
  city       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_centre_name_city UNIQUE (name, city)
);
CREATE INDEX ix_centres_city ON diagnostic_centres (lower(city));

-- Global test catalogue, e.g. "Complete Blood Count".
CREATE TABLE diagnostic_tests (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which centre offers which test, at what price.
CREATE TABLE centre_tests (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  centre_id    INTEGER NOT NULL REFERENCES diagnostic_centres (id) ON DELETE CASCADE,
  test_id      INTEGER NOT NULL REFERENCES diagnostic_tests (id) ON DELETE RESTRICT,
  price        NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_centre_test UNIQUE (centre_id, test_id)
);

CREATE TABLE bookings (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  centre_id      INTEGER NOT NULL REFERENCES diagnostic_centres (id) ON DELETE RESTRICT,
  test_id        INTEGER NOT NULL REFERENCES diagnostic_tests (id) ON DELETE RESTRICT,
  appointment_at TIMESTAMPTZ NOT NULL,
  amount         NUMERIC(10, 2) NOT NULL CHECK (amount > 0),  -- price snapshot at booking time
  status         booking_status NOT NULL DEFAULT 'PENDING',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_bookings_user_id ON bookings (user_id);
-- A user can't hold two active bookings for the same test/centre/time.
CREATE UNIQUE INDEX uq_booking_active_slot
  ON bookings (user_id, centre_id, test_id, appointment_at)
  WHERE status IN ('PENDING', 'CONFIRMED');

CREATE TABLE payments (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id         INTEGER NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  user_id            INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  amount             NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  status             payment_status NOT NULL DEFAULT 'PENDING',
  provider_reference TEXT NOT NULL UNIQUE,  -- id the provider uses in webhooks
  idempotency_key    TEXT,                  -- client Idempotency-Key header
  failure_reason     TEXT,
  processed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_user_idempotency_key UNIQUE (user_id, idempotency_key)
);
CREATE INDEX ix_payments_booking_id ON payments (booking_id);
-- A booking has at most one payment that is in flight or succeeded,
-- so it can never be paid twice, even under concurrent requests.
CREATE UNIQUE INDEX uq_payment_booking_active
  ON payments (booking_id)
  WHERE status IN ('PENDING', 'SUCCESS');

-- Every accepted webhook event. UNIQUE(event_id) makes processing idempotent.
CREATE TABLE webhook_events (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id     TEXT NOT NULL UNIQUE,
  payment_id   INTEGER NOT NULL REFERENCES payments (id) ON DELETE RESTRICT,
  status       payment_status NOT NULL,
  payload_hash TEXT NOT NULL,
  result       TEXT NOT NULL CHECK (result IN ('processed', 'ignored')),
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_webhook_events_payment_id ON webhook_events (payment_id);
