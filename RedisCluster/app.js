import express from 'express';
import client from './redis.js';

const app = express();

app.get('/users/:id', async (req, res) => {
  const key = `user:${req.params.id}`;

  const cached = await client.get(key);
  if (cached) return res.json({ source: 'cache', data: JSON.parse(cached) });

  // Replace with your real DB call
  const user = { id: req.params.id, name: 'Sample User' };

  await client.set(key, JSON.stringify(user), { EX: 60 }); // cache 60s
  res.json({ source: 'db', data: user });
});

app.listen(3000, () => console.log('Server on :3000'));