ALTER TYPE "EventStatus" ADD VALUE 'CANCELLING';

CREATE TABLE "event_cancellation_intents" (
  "id" TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL UNIQUE REFERENCES "events"("id") ON DELETE RESTRICT,
  "eventRequestId" TEXT NOT NULL REFERENCES "event_requests"("id") ON DELETE RESTRICT,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "sourceEventVersion" INTEGER NOT NULL CHECK ("sourceEventVersion" > 0),
  "requestVersion" INTEGER NOT NULL CHECK ("requestVersion" > 0),
  "acceptedEventVersion" INTEGER NOT NULL CHECK ("acceptedEventVersion" = "sourceEventVersion" + 1),
  "fromStatus" "EventStatus" NOT NULL CHECK ("fromStatus" IN ('ARRANGEMENT_PENDING', 'CONFIRMED')),
  "reason" TEXT NOT NULL CHECK (length(btrim("reason")) BETWEEN 1 AND 500),
  "acceptedAt" TIMESTAMPTZ(3) NOT NULL
);

CREATE FUNCTION protect_event_cancellation_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Accepted cancellation intents are immutable';
END;
$$;
CREATE TRIGGER event_cancellation_intents_immutable
BEFORE UPDATE OR DELETE ON "event_cancellation_intents"
FOR EACH ROW EXECUTE FUNCTION protect_event_cancellation_intent();
