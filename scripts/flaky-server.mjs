import http from 'node:http';

const failFirst = Number(process.argv[2] ?? 2);
let count = 0;

http
  .createServer((req, res) => {
    count += 1;
    console.log(`request #${count}, idempotency-key=${req.headers['idempotency-key']}`);
    if (count <= failFirst) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'temporarily unavailable' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 42, title: `worked on request ${count}` }));
  })
  .listen(4010, '127.0.0.1', () => {
    console.log(`flaky server on port 4010, failing the first ${failFirst} requests`);
  });