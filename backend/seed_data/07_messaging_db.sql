-- ═══════════════════════════════════════════════════════════════════════════
-- ConnectSphere seed data — messaging-service (messaging_db)
-- Generated against schema-updated.prisma (proposed contract).
-- Load order (cross-service references are logical only — no DB-level FKs across services):
--   1. user_db  2. auth_db  3. venue_db  4. event_db  5. booking_db
--   6. attendance_db  7. messaging_db  8. notification_db
-- Dataset "as of" 2026-09-25. All timestamps are UTC (Asia/Singapore = UTC+8).
-- Idempotent: every insert uses ON CONFLICT ("id") DO NOTHING.
-- Same-service FKs: participants.threadId, messages.threadId -> message_threads.id
-- Cross-service: message_threads.eventId -> events.id (nullable) | userId / senderId -> users.id
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- message_threads (parent — insert first)
INSERT INTO "message_threads" ("id", "eventId", "subject", "createdAt") VALUES
  ('d1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'AV setup for Product Launch', '2026-07-20 02:00:00.000'),  -- T01 E01
  ('d1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'Venue change for Parent-Teacher Symposium', '2026-08-18 03:30:00.000'),  -- T02 E02
  ('d1000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'Coordinator handover - Sustainability Forum', '2026-09-01 02:00:00.000'),  -- T03 E03
  ('d1000000-0000-4000-8000-000000000004', NULL, 'Question on rejected request: Rooftop Networking Night', '2026-09-04 05:00:00.000'),  -- T04 no event
  ('d1000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000004', 'Investor Roadshow cancellation', '2026-09-12 02:30:00.000')  -- T05 E04
ON CONFLICT ("id") DO NOTHING;

-- message_thread_participants
INSERT INTO "message_thread_participants" ("id", "threadId", "userId") VALUES
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'),  -- T01 Sarah Tan
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005'),  -- T01 Aisha Rahman
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000011'),  -- T01 Hafiz Ismail
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002'),  -- T02 Daniel Lim
  ('d2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000006'),  -- T02 Kevin Ong
  ('d2000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000009'),  -- T02 Grace Teo
  ('d2000000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003'),  -- T03 Priya Raman
  ('d2000000-0000-4000-8000-000000000008', 'd1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000005'),  -- T03 Aisha Rahman
  ('d2000000-0000-4000-8000-000000000009', 'd1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000007'),  -- T03 Mei Ling Chua
  ('d2000000-0000-4000-8000-000000000010', 'd1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004'),  -- T04 Marcus Wong
  ('d2000000-0000-4000-8000-000000000011', 'd1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000006'),  -- T04 Kevin Ong
  ('d2000000-0000-4000-8000-000000000012', 'd1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000004'),  -- T05 Marcus Wong
  ('d2000000-0000-4000-8000-000000000013', 'd1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005'),  -- T05 Aisha Rahman
  ('d2000000-0000-4000-8000-000000000014', 'd1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000008')  -- T05 Ravi Kumar
ON CONFLICT ("id") DO NOTHING;

-- messages
INSERT INTO "messages" ("id", "threadId", "senderId", "body", "sentAt") VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Hi both, can we confirm the dual projector setup and livestream for 14 Aug?', '2026-07-20 02:00:00.000'),  -- T01 from Sarah Tan
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000011', 'Confirmed. Two 4K projectors reserved; I''ll run a livestream test on 13 Aug at 16:00.', '2026-07-20 05:30:00.000'),  -- T01 from Hafiz Ismail
  ('d3000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'Thanks Hafiz. Sarah, venue load-in starts 08:00 on the day.', '2026-07-21 01:15:00.000'),  -- T01 from Aisha Rahman
  ('d3000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000006', 'Daniel, one-north Auditorium is unavailable on 22 Oct. I''ve requested Harbourfront Grand Ballroom instead.', '2026-08-18 03:30:00.000'),  -- T02 from Kevin Ong
  ('d3000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'That works for us. Banquet layout is fine.', '2026-08-18 06:00:00.000'),  -- T02 from Daniel Lim
  ('d3000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000009', 'Booking approved. The ballroom will be set for 150 in banquet layout.', '2026-08-26 02:10:00.000'),  -- T02 from Grace Teo
  ('d3000000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000005', 'Hi Priya, I''m handing this request over to Mei Ling, who will take it from here.', '2026-09-01 02:00:00.000'),  -- T03 from Aisha Rahman
  ('d3000000-0000-4000-8000-000000000008', 'd1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000007', 'Hello Priya! I''ve reviewed the details and will send a venue request shortly.', '2026-09-01 02:20:00.000'),  -- T03 from Mei Ling Chua
  ('d3000000-0000-4000-8000-000000000009', 'd1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'Thank you both. Tiered seating is our main preference.', '2026-09-01 04:45:00.000'),  -- T03 from Priya Raman
  ('d3000000-0000-4000-8000-000000000010', 'd1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 'Hi Kevin, if we cap attendance at 450, could we resubmit?', '2026-09-04 05:00:00.000'),  -- T04 from Marcus Wong
  ('d3000000-0000-4000-8000-000000000011', 'd1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000006', 'Yes - please submit a new request with the revised headcount and I''ll review it.', '2026-09-04 07:30:00.000'),  -- T04 from Kevin Ong
  ('d3000000-0000-4000-8000-000000000012', 'd1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000004', 'We need to cancel the 8 Oct roadshow; the investor round has been postponed.', '2026-09-12 02:30:00.000'),  -- T05 from Marcus Wong
  ('d3000000-0000-4000-8000-000000000013', 'd1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005', 'Understood. I''ve cancelled the event and released the Seminar Room 3 booking.', '2026-09-12 03:00:00.000'),  -- T05 from Aisha Rahman
  ('d3000000-0000-4000-8000-000000000014', 'd1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000008', 'Noted, the room has been released.', '2026-09-12 04:10:00.000')  -- T05 from Ravi Kumar
ON CONFLICT ("id") DO NOTHING;
COMMIT;
