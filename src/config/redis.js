const { createClient } = require('redis');

let publisher = null;

/**
 * When REDIS_URL is set, connects publisher + subscriber and wires team broadcast messages.
 */
async function initRedisPubSub(onTeamMessage) {
  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }

  const maxAttempts = 30;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let pub = null;
    let sub = null;
    try {
      pub = createClient({ url });
      sub = pub.duplicate();
      pub.on('error', (err) => console.error('Redis publisher error:', err.message));
      sub.on('error', (err) => console.error('Redis subscriber error:', err.message));
      await pub.connect();
      await sub.connect();
      await sub.pSubscribe('taskcloud:team:*', (message, channel) => {
        const parts = String(channel).split(':');
        const teamId = parseInt(parts[parts.length - 1], 10);
        if (!Number.isFinite(teamId)) return;
        onTeamMessage(teamId, message);
      });
      publisher = pub;
      console.log('Redis pub/sub enabled for multi-replica WebSocket fan-out');
      return publisher;
    } catch (err) {
      lastErr = err;
      console.warn(`Redis connect attempt ${attempt}/${maxAttempts} failed:`, err.message);
      try {
        if (sub && sub.isOpen) await sub.quit();
      } catch (_) {
        /* ignore */
      }
      try {
        if (pub && pub.isOpen) await pub.quit();
      } catch (_) {
        /* ignore */
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw lastErr;
}

function getPublisher() {
  return publisher;
}

module.exports = { initRedisPubSub, getPublisher };
