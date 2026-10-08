// Real-time Event Bus for Admin Live Updates (Server-Sent Events)
const clients = new Set();

function addClient(res) {
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
  });
}

function broadcastEvent(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (e) {
      clients.delete(client);
    }
  }
}

module.exports = {
  addClient,
  broadcastEvent
};
