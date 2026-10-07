import { networkInterfaces } from 'node:os';
import { createArcadeServer } from './lan-server.js';
const port = Number(process.env.PORT || 8787);
const server = createArcadeServer(); server.listen(port, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address);
  console.log(`本机: http://localhost:${port}`); addresses.forEach(address => console.log(`局域网: http://${address}:${port}`));
});
