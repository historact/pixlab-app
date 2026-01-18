const http = require('http');
const { sendAlert } = require('../utils/alerts');
const { updateAlertSettings } = require('../utils/logger');

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBgQW9tV8AAAAASUVORK5CYII=';

function startMockTelegramServer() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      requests.push({
        url: req.url,
        method: req.method,
        headers: req.headers,
        body,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    });
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        server,
        requests,
      });
    });
  });
}

async function main() {
  const mock = await startMockTelegramServer();
  process.env.ALERT_TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.ALERT_TELEGRAM_API_BASE_URL = `http://127.0.0.1:${mock.port}`;
  process.env.ALERT_EMAIL_JSON_TRANSPORT = 'true';

  updateAlertSettings({
    email: { enabled: true, recipients: ['alerts@example.com'] },
    telegram: { enabled: true, targets: ['12345'] },
  });

  const buffer = Buffer.from(PNG_BASE64, 'base64');
  const result = await sendAlert(
    {
      channel: 'runtime',
      level: 'warn',
      event: 'monitoring.alert.firing',
      message: 'Test alert snapshot pipeline',
      snapshot_url: 'https://example.com/snapshot',
    },
    {
      force: true,
      attachments: [
        {
          filename: 'monitoring.png',
          content: buffer,
          contentType: 'image/png',
        },
      ],
      telegramPhoto: {
        buffer,
        contentType: 'image/png',
        caption: 'Test alert snapshot pipeline',
        filename: 'monitoring.png',
      },
    }
  );

  const messageRequest = mock.requests.find(req => req.url.includes('/sendMessage'));
  const photoRequest = mock.requests.find(req => req.url.includes('/sendPhoto'));
  if (!messageRequest) {
    throw new Error('Expected sendMessage request');
  }
  if (!photoRequest) {
    throw new Error('Expected sendPhoto request');
  }
  if (!photoRequest.headers['content-type']?.includes('multipart/form-data')) {
    throw new Error('Expected multipart/form-data for sendPhoto');
  }
  if (!photoRequest.body.includes('image/png')) {
    throw new Error('Expected image/png in sendPhoto payload');
  }
  if (!result.ok) {
    throw new Error(`Alert send failed: ${JSON.stringify(result)}`);
  }

  mock.server.close();
  console.log('PASS');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
