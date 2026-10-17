// CS-50: a signed-in user's own in-app notices. Every query is filtered by
// the caller's id from the verified session; a notice id that belongs to
// someone else is answered with 404, never with its contents.
const express = require('express');
const { requireAuth, requireAnyPermission } = require('../auth');
const store = require('../store');
const { badgeLabel } = require('../templates');

const router = express.Router();
const auth = requireAuth();

router.get('/', auth, async (req, res) => {
  const { items, unread } = await store.listFor(req.actor.id);
  return res.json({ items, unread, badge: badgeLabel(unread) });
});

// Small call for the bell badge.
router.get('/summary', auth, async (req, res) => {
  const unread = await store.unreadCount(req.actor.id);
  return res.json({ unread, badge: badgeLabel(unread) });
});

// Technical Support: messages that failed after 3 retries (CS-50 AC5).
// Shows the message type, ids, attempts and error only, no notice text.
router.get('/failures', auth, requireAnyPermission('audit.view'), async (req, res) => {
  const items = await store.listFailed();
  return res.json({ items, total: items.length });
});

router.get('/:id', auth, async (req, res) => {
  const notice = await store.getOwn(req.params.id, req.actor.id);
  return notice ? res.json(notice) : res.status(404).json({ error: 'Notification not found' });
});

router.post('/:id/read', auth, async (req, res) => {
  const ok = await store.markRead(req.params.id, req.actor.id);
  return ok ? res.status(204).end() : res.status(404).json({ error: 'Notification not found' });
});

module.exports = router;
