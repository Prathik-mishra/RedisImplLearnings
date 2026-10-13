import client from './redis.js';

await client.set('greeting', 'hello redis');
console.log(await client.get('greeting')); // hello redis

// Key with expiry (10 seconds)
await client.set('session:123', 'user-data', { EX: 10 });

// Hashes
await client.hSet('user:1', { name: 'Asha', role: 'admin' });
console.log(await client.hGetAll('user:1'));

await client.quit();