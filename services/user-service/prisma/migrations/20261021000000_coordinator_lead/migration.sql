-- CS-10 Week 7: internal Event Coordinator Lead role (controlled provisioning only).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EVENT_COORDINATOR_LEAD';
