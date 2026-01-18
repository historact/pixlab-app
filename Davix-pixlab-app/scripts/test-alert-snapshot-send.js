const { generateAlertSnapshot } = require('../utils/monitoringSnapshot');
const { prepareAttachments, prepareTelegramPhoto } = require('../utils/alerts');

async function main() {
  const ruleId = process.argv[2] || 'manual';
  const snapshotResult = await generateAlertSnapshot(ruleId);
  const buffer = snapshotResult?.buffer;
  if (!buffer || !buffer.length) {
    throw new Error('Snapshot buffer is empty');
  }
  const signature = buffer.subarray(0, 8).toString('hex');
  const pngSignature = '89504e470d0a1a0a';
  if (signature !== pngSignature) {
    throw new Error(`Snapshot is not PNG: ${signature}`);
  }

  const attachments = await prepareAttachments([
    { filename: snapshotResult.filename || 'monitoring.png', content: buffer, contentType: 'image/png' },
  ]);
  if (!attachments.length || !attachments[0].content) {
    throw new Error('Email attachment not prepared');
  }

  const telegramPhoto = await prepareTelegramPhoto({ buffer, caption: 'test', filename: snapshotResult.filename });
  if (!telegramPhoto || !telegramPhoto.buffer) {
    throw new Error('Telegram photo not prepared');
  }

  console.log('PASS');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
