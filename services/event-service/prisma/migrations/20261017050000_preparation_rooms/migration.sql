ALTER TABLE preparation_updates ADD COLUMN "bookingId" TEXT;
ALTER TABLE preparation_updates ADD CONSTRAINT preparation_room_required CHECK (area<>'VENUE' OR "bookingId" IS NOT NULL) NOT VALID;
