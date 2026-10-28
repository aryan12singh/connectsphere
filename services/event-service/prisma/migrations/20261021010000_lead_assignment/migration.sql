-- CS-30 / CS-81 (Week 7): a Coordinator Lead assigns queued requests, so a new
-- assignment reason is needed. AUTO stays so earlier history remains valid.
ALTER TYPE "AssignmentReason" ADD VALUE IF NOT EXISTS 'ASSIGNED';
